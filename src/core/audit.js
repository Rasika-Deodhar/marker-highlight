// Independent check that a set of highlights does not misrepresent the text.
//
// It deliberately does not reuse the engine's selection code: it re-reads the text, looks at
// which characters ended up marked (either tier), and reports every place where following
// the marks alone would drop a meaning-changing word. Used by the tests and by `npm run eval`.
// An empty result means "no known distortion pattern", not "meaning proven intact".

import { hasNegativeAffix, isContrast, isNegation, isQualifier, NEGATION_REACH } from './context-words.js';
import { STOPWORDS_EN } from './stopwords.js';
import { isSentenceBreak, tokenize } from './text.js';

/**
 * @returns {{ rule: string, block: number, word: string, sentence: string }[]}
 */
export function audit(input, result, { stopwords = STOPWORDS_EN } = {}) {
  const problems = [];

  input.forEach((raw, b) => {
    const block = typeof raw === 'string' ? { text: raw, kind: 'body' } : raw;
    const { ranges, context = [] } = result.blocks[b];
    const text = block.text;
    const all = [...ranges, ...context].sort((x, y) => x[0] - y[0]);
    const covered = (t) => all.some(([s, e]) => s <= t.start && t.end <= e);
    const tokens = tokenize(text);

    // Marks must cover whole words and must not overlap.
    let cursor = 0;
    for (const [s, e] of all) {
      if (s < cursor) problems.push({ rule: 'overlapping-marks', block: b, word: text.slice(s, e), sentence: '' });
      cursor = e;
      const whole = tokens.some((t) => t.start === s) && tokens.some((t) => t.end === e);
      if (!whole) problems.push({ rule: 'partial-word', block: b, word: text.slice(s, e), sentence: '' });
    }
    if (block.kind === 'heading') return;

    // Split into sentences.
    const sentences = [];
    tokens.forEach((t, i) => {
      if (i === 0 || isSentenceBreak(text, tokens[i - 1], t)) sentences.push([]);
      sentences.at(-1).push(t);
    });
    const unbroken = (a, c) => /^\s*[-–]?\s*$/.test(text.slice(a.end, c.start));
    const isContent = (t) => !stopwords.has(t.text.toLowerCase().replace(/’/g, "'")) && (t.text.length >= 3 || /^\d/.test(t.text));

    for (const sent of sentences) {
      const quote = text.slice(sent[0].start, sent.at(-1).end);
      const report = (rule, t) => problems.push({ rule, block: b, word: t.text, sentence: quote });

      sent.forEach((t, i) => {
        if (isContrast(t.text) && !covered(t) && sent.some(covered)) report('contrast-dropped', t);
        if (isNegation(t.text)) {
          if (!covered(t)) report('negation-dropped', t);
          for (let j = i + 1; j < sent.length && j <= i + NEGATION_REACH && unbroken(sent[j - 1], sent[j]); j++) {
            if (!isContent(sent[j]) || isNegation(sent[j].text)) continue;
            if (!covered(sent[j])) report('negated-word-dropped', sent[j]);
            break;
          }
        }
        const next = sent[i + 1];
        if (next && !covered(t) && covered(next) && unbroken(t, next)) {
          if (hasNegativeAffix(t.text)) report('negative-modifier-dropped', t);
          else if (isQualifier(t.text)) report('qualifier-dropped', t);
        }
      });
    }
  });

  return problems;
}

/** Share of the given phrases whose every word is marked (tier 1 unless `anyTier`). */
export function coverage(input, result, phrases, { anyTier = false } = {}) {
  const hits = phrases.filter((phrase) =>
    input.some((raw, b) => {
      const text = typeof raw === 'string' ? raw : raw.text;
      const marks = anyTier ? [...result.blocks[b].ranges, ...result.blocks[b].context] : result.blocks[b].ranges;
      for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
        const words = tokenize(phrase).map((t) => ({ start: at + t.start, end: at + t.end }));
        if (words.every((w) => marks.some(([s, e]) => s <= w.start && w.end <= e))) return true;
      }
      return false;
    }),
  );
  return { hit: hits.length, total: phrases.length, missed: phrases.filter((p) => !hits.includes(p)) };
}
