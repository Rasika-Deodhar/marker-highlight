// Decides what is read aloud, and in what pieces. Pure: no DOM, no speech API.
//
// Speech is sent one sentence at a time. That keeps the "now reading" marker in step with
// the voice without relying on word-boundary events (which many voices do not send), lets
// speed changes take effect at once, and avoids browsers cutting off long utterances.

import { isSentenceBreak, tokenize } from '../core/text.js';

const OPENERS = /[“"'‘(\[]/;

/**
 * @typedef {{block: number, ranges: [number, number][], text: string}} Chunk
 *   `ranges` are the character ranges of the block's text that the chunk speaks.
 *
 * @param {{text: string, kind?: string, ranges?: [number, number][], context?: [number, number][]}[]} blocks
 *   block text with the engine's marker (`ranges`) and context ranges for it
 * @param {'all'|'quick'} mode  'all' reads everything; 'quick' reads only what is marked,
 *   the way the eye skims from highlight to highlight. Headings are always read in full.
 * @returns {Chunk[]}
 */
export function buildQueue(blocks, mode) {
  const queue = [];
  blocks.forEach((block, index) => {
    const sentences = splitSentences(block.text);
    if (mode !== 'quick' || block.kind === 'heading') {
      for (const [start, end] of sentences) queue.push({ block: index, ranges: [[start, end]], text: block.text.slice(start, end) });
      return;
    }
    const marks = mergeRanges([...(block.ranges ?? []), ...(block.context ?? [])], block.text);
    for (const [start, end] of sentences) {
      const inSentence = marks.filter(([s, e]) => s >= start && e <= end);
      if (!inSentence.length) continue;
      // A comma between phrases gives the voice a short pause where words were skipped.
      queue.push({ block: index, ranges: inSentence, text: inSentence.map(([s, e]) => block.text.slice(s, e)).join(', ') });
    }
  });
  return queue.filter((chunk) => /[\p{L}\p{N}]/u.test(chunk.text));
}

/** @returns {[number, number][]} sentence ranges, trimmed of surrounding whitespace */
export function splitSentences(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  const sentences = [];
  let first = tokens[0];
  for (let i = 1; i <= tokens.length; i++) {
    const prev = tokens[i - 1];
    const next = tokens[i];
    if (next && !isSentenceBreak(text, prev, next)) continue;
    // Keep closing punctuation with its sentence: extend to just before the next word.
    let end = next ? text.slice(0, next.start).trimEnd().length : text.trimEnd().length;
    // ...but an opening quote or bracket before the next word belongs to that next sentence.
    while (next && end > prev.end && OPENERS.test(text[end - 1]) && /\s/.test(text[end - 2] ?? '')) {
      end = text.slice(0, end - 1).trimEnd().length;
    }
    sentences.push([first.start, Math.max(end, prev.end)]);
    first = next;
  }
  // Opening quotes and brackets belong to the sentence they open.
  return sentences.map(([start, end], i) => {
    const floor = i ? sentences[i - 1][1] : 0;
    while (start > floor && OPENERS.test(text[start - 1])) start--;
    return [start, end];
  });
}

/** Sort ranges and join those separated only by spaces, so a phrase is spoken as one. */
function mergeRanges(ranges, text) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && /^\s*$/.test(text.slice(last[1], start))) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
