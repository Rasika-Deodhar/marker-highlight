// The highlighting engine: text in, character ranges out.
//
// Pure and synchronous. It never touches the DOM or the network, which is what lets the
// same file power the web app today and an extension content script later.
// The scoring rationale is documented in docs/ARCHITECTURE.md ("Scoring model").

import { COMMON_EN, STOPWORDS_EN } from './stopwords.js';
import { isSentenceBreak, termKey, tokenize } from './text.js';

export const DEFAULT_DENSITY = 0.2;
export const MIN_DENSITY = 0.05;
export const MAX_DENSITY = 0.4;

// Blocks at least this long always receive one highlight, so no paragraph is invisible
// to a skimming reader.
const COVERAGE_MIN_WORDS = 12;

const COMMON_WORD_DISCOUNT = 0.55;

const WEIGHTS = {
  frequency: 0.35, // repeated terms are what the text is about
  spread: 0.15, // ...especially when they recur across paragraphs
  casing: 0.2, // names and acronyms (capitalised mid-sentence)
  heading: 0.15, // the author already told us these matter
  length: 0.12, // longer words are rarer and carry more information
  early: 0.03, // authors introduce key ideas first
};

/**
 * @typedef {{ text: string, kind?: 'body' | 'heading' }} Block
 * @typedef {{ density?: number, stopwords?: Set<string>, commonWords?: Set<string> }} Options
 *
 * @param {(Block | string)[]} input  Paragraph-level blocks in reading order.
 * @param {Options} [options]
 * @returns {{
 *   blocks: { ranges: [number, number][] }[],
 *   stats: { words: number, highlighted: number, density: number },
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
  bridgePhrases(perBlock, blocks);

  return {
    blocks: perBlock.map((list, i) => ({ ranges: toRanges(list, blocks[i].text) })),
    stats: {
      words: bodyTokens.length,
      highlighted: bodyTokens.filter((t) => t.selected).length,
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
        content: !isStop && (isNumber || isAcronym || tok.text.length >= 3),
        score: 0,
        selected: false,
      });
      tokens.push(tok);
    });
    perBlock.push(list);
    sentence++;
  });

  return { tokens, perBlock, sentenceCount: sentence };
}

function scoreTerms(tokens, blocks, commonWords) {
  const terms = new Map();
  tokens.forEach((tok, position) => {
    if (!tok.content) return;
    let term = terms.get(tok.key);
    if (!term) {
      term = { display: tok.text, common: commonWords.has(tok.text.toLowerCase()), count: 0, names: 0, blocks: new Set(), first: position, inHeading: false, isNumber: tok.isNumber, length: tok.text.length };
      terms.set(tok.key, term);
    }
    term.count++;
    if (tok.isName) term.names++;
    if (tok.body) term.blocks.add(tok.block);
    else term.inHeading = true;
  });

  const bodyBlocks = Math.max(1, blocks.filter((b) => b.kind !== 'heading').length);
  const maxCount = Math.max(1, ...[...terms.values()].filter((t) => !t.isNumber).map((t) => t.count));
  const total = Math.max(1, tokens.length);

  for (const term of terms.values()) {
    if (term.isNumber) {
      // Figures (dates, quantities, percentages) are dense facts regardless of frequency;
      // a lone digit is usually a list marker.
      term.score = term.length >= 2 ? 0.55 : 0.2;
      continue;
    }
    term.score =
      WEIGHTS.frequency * (Math.log1p(term.count) / Math.log1p(maxCount)) +
      WEIGHTS.spread * Math.sqrt(term.blocks.size / bodyBlocks) +
      WEIGHTS.casing * (term.names / term.count) +
      WEIGHTS.heading * (term.inHeading ? 1 : 0) +
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
      Math.max(0.4, 0.85 ** overall);
  }
}

function select(bodyTokens, perBlock, budget) {
  const ranked = bodyTokens
    .filter((t) => t.content)
    .sort((a, b) => b.score - a.score || a.block - b.block || a.start - b.start);
  for (const tok of ranked.slice(0, budget)) tok.selected = true;

  // Coverage guarantee.
  for (const list of perBlock) {
    if (list.length < COVERAGE_MIN_WORDS || !list[0].body || list.some((t) => t.selected)) continue;
    const best = list.filter((t) => t.content).sort((a, b) => b.score - a.score)[0];
    if (best) best.selected = true;
  }
}

/**
 * Make highlights read as whole phrases:
 *  - a figure takes the word it counts with it: "79 percent", "3 experiments";
 *  - one function word between two highlights is absorbed: "theory of mind".
 */
function bridgePhrases(perBlock, blocks) {
  perBlock.forEach((list, b) => {
    const text = blocks[b].text;
    for (let i = 0; i < list.length - 1; i++) {
      const [tok, next] = [list[i], list[i + 1]];
      if (tok.selected && tok.isNumber && next.content && !next.isNumber && isJoined(text, tok, next)) next.selected = true;
    }
    for (let i = 1; i < list.length - 1; i++) {
      const [prev, tok, next] = [list[i - 1], list[i], list[i + 1]];
      if (tok.selected || !tok.isStop || !prev.selected || !next.selected) continue;
      if (isJoined(text, prev, tok) && isJoined(text, tok, next)) tok.selected = true;
    }
  });
}

/** Adjacent selected words merge into one range so a phrase gets one continuous stroke. */
function toRanges(list, text) {
  const ranges = [];
  let open = null;
  let last = null;
  for (const tok of list) {
    if (!tok.selected) continue;
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
