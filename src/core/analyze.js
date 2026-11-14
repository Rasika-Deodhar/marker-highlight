// The highlighting engine: text in, character ranges out.
//
// Pure and synchronous. It never touches the DOM or the network, which is what lets the
// same file power the web app today and an extension content script later.
// The scoring rationale is documented in docs/ARCHITECTURE.md ("Scoring model").

import { hasNegativeAffix, isContrast, isNegation, isQualifier, NEGATION_REACH } from './context-words.js';
import { COMMON_EN, STOPWORDS_EN } from './stopwords.js';
import { isSentenceBreak, termKey, tokenize } from './text.js';

export const DEFAULT_DENSITY = 0.2;
export const MIN_DENSITY = 0.05;
export const MAX_DENSITY = 0.4;

// Blocks at least this long always receive one highlight, so no paragraph is invisible
// to a skimming reader.
const COVERAGE_MIN_WORDS = 12;

const COMMON_WORD_DISCOUNT = 0.55;
const MAX_PHRASE_WORDS = 3;

const WEIGHTS = {
  frequency: 0.35, // repeated terms are what the text is about
  spread: 0.15, // ...especially when they recur across paragraphs
  casing: 0.2, // names and acronyms (capitalised mid-sentence)
  heading: 0.15, // the author already told us these matter
  phrase: 0.06, // words inside multi-word terms ("stomach ulcers") tend to be the subject matter
  length: 0.08, // longer words are rarer and carry more information
  early: 0.03, // authors introduce key ideas first
};

/**
 * @typedef {{ text: string, kind?: 'body' | 'heading' }} Block
 * @typedef {{ density?: number, stopwords?: Set<string>, commonWords?: Set<string>, context?: boolean }} Options
 *
 * @param {(Block | string)[]} input  Paragraph-level blocks in reading order.
 * @param {Options} [options]
 * @returns {{
 *   blocks: { ranges: [number, number][], context: [number, number][] }[],
 *   stats: { words: number, highlighted: number, context: number, density: number },
 *   keywords: { term: string, score: number }[],
 * }}
 */
export function analyze(input, options = {}) {
  const stopwords = options.stopwords ?? STOPWORDS_EN;
  const density = clamp(options.density ?? DEFAULT_DENSITY, MIN_DENSITY, MAX_DENSITY);
  const blocks = input.map((b) => (typeof b === 'string' ? { text: b, kind: 'body' } : b));

  const { tokens, perBlock, sentenceCount } = readTokens(blocks, stopwords);
  const terms = scoreTerms(tokens, blocks, options.commonWords ?? COMMON_EN);
  const sentenceScores = scoreSentences(tokens, terms, sentenceCount);
  scoreOccurrences(tokens, terms, sentenceScores);

  const bodyTokens = tokens.filter((t) => t.body);
  const budget = Math.round(bodyTokens.length * density);
  select(bodyTokens, perBlock, budget);
  attachUnits(perBlock, blocks);
  if (options.context !== false) addContext(perBlock, blocks);

  return {
    blocks: perBlock.map((list, i) => ({
      // Tier 1: the important words themselves (painted as marker).
      ranges: toRanges(list, blocks[i].text, (t) => t.selected),
      // Tier 2: words that keep those highlights truthful (painted as underline).
      context: toRanges(list, blocks[i].text, (t) => t.support && !t.selected),
    })),
    stats: {
      words: bodyTokens.length,
      highlighted: bodyTokens.filter((t) => t.selected).length,
      context: bodyTokens.filter((t) => t.support && !t.selected).length,
      density,
    },
    keywords: [...terms.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((t) => ({ term: t.display, score: round(t.score) })),
  };
}

function readTokens(blocks, stopwords) {
  const tokens = [];
  const perBlock = [];
  let sentence = 0;

  blocks.forEach((block, blockIndex) => {
    const list = tokenize(block.text);
    let sentenceInBlock = 0;
    list.forEach((tok, i) => {
      const startsSentence = i === 0 || isSentenceBreak(block.text, list[i - 1], tok);
      if (startsSentence && i > 0) {
        sentence++;
        sentenceInBlock++;
      }
      const lower = tok.text.toLowerCase().replace(/’/g, "'");
      const isNumber = /^\d/.test(tok.text);
      const isAcronym = tok.text.length >= 2 && /^[\p{Lu}\d]+$/u.test(tok.text) && /\p{Lu}/u.test(tok.text);
      const isStop = stopwords.has(lower);
      // Negations, contrasts and qualifiers belong to the context tier, never to tier 1.
      const isContextWord = isNegation(tok.text) || isContrast(tok.text) || isQualifier(tok.text);
      Object.assign(tok, {
        block: blockIndex,
        body: block.kind !== 'heading',
        sentence,
        topicSentence: sentenceInBlock === 0,
        key: isNumber ? `#${tok.text}` : termKey(tok.text),
        isStop,
        isNumber,
        // Capitalised where grammar did not require it => likely a name.
        isName: isAcronym || (!startsSentence && /^\p{Lu}\p{Ll}/u.test(tok.text)),
        content: !isStop && !isContextWord && (isNumber || isAcronym || tok.text.length >= 3),
        isNegation: isNegation(tok.text),
        isContrast: isContrast(tok.text),
        isQualifier: isQualifier(tok.text),
        negativeAffix: hasNegativeAffix(tok.text),
        score: 0,
        selected: false,
        support: false,
      });
      tokens.push(tok);
    });
    markRuns(list, block.text);
    perBlock.push(list);
    sentence++;
  });

  return { tokens, perBlock, sentenceCount: sentence };
}

/** Flag words that sit in an unbroken run of two or more content words (RAKE's candidate phrases). */
function markRuns(list, text) {
  for (let i = 0; i < list.length; ) {
    let j = i;
    while (list[j].content && j + 1 < list.length && list[j + 1].content && isJoined(text, list[j], list[j + 1])) j++;
    for (let k = i; k <= j; k++) {
      list[k].inPhrase = j > i;
      // Short runs are treated as one term and selected whole: "stomach ulcers".
      list[k].phrase = j > i && j - i < MAX_PHRASE_WORDS ? list.slice(i, j + 1) : null;
    }
    i = j + 1;
  }
}

function scoreTerms(tokens, blocks, commonWords) {
  const terms = new Map();
  tokens.forEach((tok, position) => {
    if (!tok.content) return;
    let term = terms.get(tok.key);
    if (!term) {
      term = { display: tok.text, common: commonWords.has(tok.text.toLowerCase()), count: 0, names: 0, phrases: 0, blocks: new Set(), first: position, inHeading: false, isNumber: tok.isNumber, length: tok.text.length };
      terms.set(tok.key, term);
    }
    term.count++;
    if (tok.isName) term.names++;
    if (tok.inPhrase) term.phrases++;
    if (tok.body) term.blocks.add(tok.block);
    else term.inHeading = true;
  });

  const bodyBlocks = Math.max(1, blocks.filter((b) => b.kind !== 'heading').length);
  const maxCount = Math.max(1, ...[...terms.values()].filter((t) => !t.isNumber).map((t) => t.count));
  const total = Math.max(1, tokens.length);

  for (const term of terms.values()) {
    if (term.isNumber) {
      // Figures (dates, quantities, percentages) are dense facts regardless of frequency.
      term.score = term.length >= 2 ? 0.55 : 0.45;
      continue;
    }
    term.score =
      WEIGHTS.frequency * (Math.log1p(term.count) / Math.log1p(maxCount)) +
      WEIGHTS.spread * Math.sqrt(term.blocks.size / bodyBlocks) +
      WEIGHTS.casing * (term.names / term.count) +
      WEIGHTS.heading * (term.inHeading ? 1 : 0) +
      WEIGHTS.phrase * (term.phrases / term.count) +
      WEIGHTS.length * (Math.min(term.length, 12) / 12) +
      WEIGHTS.early * (1 - term.first / total);
    if (term.common && !term.names) term.score *= COMMON_WORD_DISCOUNT;
  }
  return terms;
}

/** A sentence is as important as the terms it contains (centroid scoring), normalised to 0..1. */
function scoreSentences(tokens, terms, sentenceCount) {
  const sum = new Float64Array(sentenceCount + 1);
  const n = new Float64Array(sentenceCount + 1);
  for (const tok of tokens) {
    if (!tok.content) continue;
    sum[tok.sentence] += terms.get(tok.key).score;
    n[tok.sentence]++;
  }
  let max = 0;
  const scores = sum.map((s, i) => {
    // Dividing by sqrt keeps long sentences from winning on size alone without
    // favouring two-word fragments.
    const v = n[i] ? s / Math.sqrt(n[i]) : 0;
    if (v > max) max = v;
    return v;
  });
  return max ? scores.map((v) => v / max) : scores;
}

function scoreOccurrences(tokens, terms, sentenceScores) {
  const seenInBlock = new Map();
  const seenOverall = new Map();
  let block = -1;
  for (const tok of tokens) {
    if (tok.block !== block) {
      block = tok.block;
      seenInBlock.clear();
    }
    if (!tok.content || !tok.body) continue;
    const local = seenInBlock.get(tok.key) ?? 0;
    const overall = seenOverall.get(tok.key) ?? 0;
    seenInBlock.set(tok.key, local + 1);
    seenOverall.set(tok.key, overall + 1);

    tok.score =
      terms.get(tok.key).score *
      (0.7 + 0.3 * sentenceScores[tok.sentence]) *
      (tok.topicSentence ? 1.15 : 1) *
      // Novelty: marking the same word again and again adds ink, not information.
      0.6 ** local *
      Math.max(0.3, 0.7 ** overall);
  }
}

function select(bodyTokens, perBlock, budget) {
  const ranked = bodyTokens
    .filter((t) => t.content)
    .sort((a, b) => b.score - a.score || a.block - b.block || a.start - b.start);
  let used = 0;
  for (const tok of ranked) {
    if (used >= budget) break;
    if (tok.selected) continue;
    // A word that is part of a short phrase is taken with the whole phrase or not at all:
    // "black stools" must not be reduced to "stools".
    const group = (tok.phrase ?? [tok]).filter((t) => !t.selected);
    if (used + group.length > budget + 1) continue;
    for (const t of group) t.selected = true;
    used += group.length;
  }

  // Coverage guarantee.
  for (const list of perBlock) {
    if (list.length < COVERAGE_MIN_WORDS || !list[0].body || list.some((t) => t.selected)) continue;
    const best = list.filter((t) => t.content).sort((a, b) => b.score - a.score)[0];
    if (best) for (const t of best.phrase ?? [best]) t.selected = true;
  }
}

/** A figure takes the word it counts with it: "79 percent", "400 mg", "3 March". */
function attachUnits(perBlock, blocks) {
  perBlock.forEach((list, b) => {
    const text = blocks[b].text;
    for (let i = 0; i < list.length - 1; i++) {
      const [tok, next] = [list[i], list[i + 1]];
      if (tok.selected && tok.isNumber && !next.isStop && !next.isNumber && isJoined(text, tok, next)) next.selected = true;
    }
  });
}

/**
 * Second tier. Reading only the marked words must not say something the sentence does not.
 *  1. Every negation in the text is marked, with its auxiliary and the phrase it negates
 *     ("DOES NOT DELETE", "WITHOUT the PRIOR WRITTEN CONSENT"). This holds even in
 *     sentences with no highlight, so no negated statement is invisible to a skimmer.
 *  2. In a sentence that has marks, each contrast word is marked ("BUT", "although").
 *  3. A qualifier or negative-prefixed word directly before a marked word is marked
 *     ("ONLY 16 percent", "UNAIDED skimming").
 *  4. One or two function words stranded between marked words are marked, so phrases
 *     read whole ("speed AND comprehension", "risk OF heart disease").
 * src/core/audit.js verifies rules 1-3 independently of this code.
 */
function addContext(perBlock, blocks) {
  perBlock.forEach((list, b) => {
    if (!list.length || !list[0].body) return;
    const text = blocks[b].text;
    const marked = (t) => t.selected || t.support;
    const joined = (i) => isJoined(text, list[i], list[i + 1]);

    list.forEach((tok, i) => {
      if (!tok.isNegation) return;
      tok.support = true;
      if (i > 0 && list[i - 1].isStop && !list[i - 1].isContrast && joined(i - 1)) list[i - 1].support = true; // "did" not
      for (let j = i + 1; j < list.length && j <= i + NEGATION_REACH && joined(j - 1); j++) {
        if (!list[j].content || list[j].isNegation) continue;
        // Take the rest of the negated phrase too: "written consent", "medical advice".
        while (j + 1 < list.length && j < i + NEGATION_REACH && list[j + 1].content && joined(j)) j++;
        for (let k = i + 1; k <= j; k++) list[k].support = true;
        break;
      }
    });

    const sentencesWithMarks = new Set(list.filter(marked).map((t) => t.sentence));
    for (const tok of list) if (tok.isContrast && sentencesWithMarks.has(tok.sentence)) tok.support = true;

    for (let i = list.length - 2; i >= 0; i--) {
      const [tok, next] = [list[i], list[i + 1]];
      if (marked(tok) || !joined(i)) continue;
      if (marked(next) && (tok.isQualifier || tok.negativeAffix)) tok.support = true;
      // A qualifier also reaches across function words: "ONLY when the INDEX".
      if (!tok.isQualifier) continue;
      for (let j = i + 1; j < list.length && j <= i + 3 && joined(j - 1); j++) {
        if (marked(list[j])) tok.support = true;
        if (marked(list[j]) || !list[j].isStop) break;
      }
    }

    for (let i = 0; i < list.length - 2; i++) {
      if (!marked(list[i]) || marked(list[i + 1])) continue;
      let end = i + 1;
      while (end < list.length && end <= i + 2 && !marked(list[end]) && list[end].isStop && joined(end - 1)) end++;
      if (end < list.length && end > i + 1 && marked(list[end]) && joined(end - 1)) {
        for (let k = i + 1; k < end; k++) list[k].support = true;
      }
    }
  });
}

/** Adjacent marked words of one tier merge into one range so a phrase gets one stroke. */
function toRanges(list, text, inTier) {
  const ranges = [];
  let open = null;
  let last = null;
  for (const tok of list) {
    if (!inTier(tok)) {
      open = null;
      continue;
    }
    if (open && isJoined(text, last, tok)) open[1] = tok.end;
    else ranges.push((open = [tok.start, tok.end]));
    last = tok;
  }
  return ranges;
}

function isJoined(text, a, b) {
  return /^\s*[-–]?\s*$/.test(text.slice(a.end, b.start)) && a.sentence === b.sentence;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 1000) / 1000;
