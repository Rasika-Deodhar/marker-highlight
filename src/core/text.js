// Text primitives. No DOM, no dependencies: runs in a page, a worker, an extension or Node.

// A word: letters/digits, optionally joined by an apostrophe or hyphen ("don't",
// "well-known"), or by . , between digits ("3.5", "10,000").
const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+|[.,]\d+)*/gu;

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'fig', 'no', 'inc', 'ltd', 'jr', 'sr']);
const SENTENCE_END_RE = /[.!?]["'”’)\]]*\s|\n\s*\n/;

/** @returns {{text: string, start: number, end: number}[]} */
export function tokenize(text) {
  const tokens = [];
  for (const m of text.matchAll(WORD_RE)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** True when a sentence boundary lies between two adjacent tokens. */
export function isSentenceBreak(text, prev, next) {
  const gap = text.slice(prev.end, next.start);
  if (!SENTENCE_END_RE.test(gap)) return false;
  if (gap.includes('\n\n') || !gap.startsWith('.')) return true;
  // "Dr. Smith", "J. K. Rowling": a period after an abbreviation or initial is not a boundary.
  return !(prev.text.length === 1 || ABBREVIATIONS.has(prev.text.toLowerCase()));
}

/** Light plural-folding so "highlight" and "highlights" count as one term. */
export function termKey(word) {
  const w = word.toLowerCase().replace(/’/g, "'").replace(/'s$/, '');
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(?:ch|sh|ss|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
