import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyze, MAX_DENSITY } from '../src/core/analyze.js';
import { isSentenceBreak, termKey, tokenize } from '../src/core/text.js';

const ARTICLE = [
  { text: 'Photosynthesis in plants', kind: 'heading' },
  'Photosynthesis is the process by which plants convert sunlight into chemical energy. It takes place inside chloroplasts, which contain a green pigment called chlorophyll.',
  'During photosynthesis, plants absorb carbon dioxide from the air and water from the soil. Using the energy of sunlight, they turn these into glucose and release oxygen as a by-product.',
  'Jan Ingenhousz showed in 1779 that plants need light to do this. Almost all life on Earth depends on the oxygen and the glucose that photosynthesis produces.',
];

const highlightedText = (input, result) =>
  result.blocks.flatMap((b, i) => {
    const text = typeof input[i] === 'string' ? input[i] : input[i].text;
    return b.ranges.map(([s, e]) => text.slice(s, e));
  });

test('tokenize keeps contractions, hyphenated words and decimals whole', () => {
  const words = tokenize("Don't split well-known values like 3.5 or 10,000.").map((t) => t.text);
  assert.deepEqual(words, ["Don't", 'split', 'well-known', 'values', 'like', '3.5', 'or', '10,000']);
});

test('termKey folds plurals and possessives', () => {
  assert.equal(termKey('Highlights'), 'highlight');
  assert.equal(termKey('theories'), 'theory');
  assert.equal(termKey("reader's"), 'reader');
  assert.equal(termKey('process'), 'process');
  assert.equal(termKey('analysis'), 'analysis');
});

test('sentence breaks ignore abbreviations and initials', () => {
  const text = 'Dr. Smith agreed. Others did not.';
  const t = tokenize(text);
  assert.equal(isSentenceBreak(text, t[0], t[1]), false);
  assert.equal(isSentenceBreak(text, t[2], t[3]), true);
});

test('never highlights a stopword on its own', () => {
  const result = analyze(ARTICLE, { density: MAX_DENSITY });
  for (const phrase of highlightedText(ARTICLE, result)) {
    assert.ok(!/^(the|is|by|which|into|it|and|from|of|as|a|in|that|to|do|this|on)$/i.test(phrase), phrase);
  }
});

test('headings are used as evidence but are not themselves highlighted', () => {
  const result = analyze(ARTICLE);
  assert.deepEqual(result.blocks[0].ranges, []);
  assert.equal(result.keywords[0].term.toLowerCase(), 'photosynthesis');
});

test('picks out the topic term, names and figures', () => {
  const marked = highlightedText(ARTICLE, analyze(ARTICLE)).join(' | ');
  assert.match(marked, /Photosynthesis/);
  assert.match(marked, /Ingenhousz/);
  assert.match(marked, /1779/);
});

test('stays close to the requested density', () => {
  for (const density of [0.1, 0.2, 0.3]) {
    const { stats } = analyze(ARTICLE, { density });
    const actual = stats.highlighted / stats.words;
    assert.ok(Math.abs(actual - density) < 0.08, `asked ${density}, got ${actual.toFixed(2)}`);
  }
});

test('density is clamped so the page can never become mostly highlighted', () => {
  const { stats } = analyze(ARTICLE, { density: 1 });
  assert.equal(stats.density, MAX_DENSITY);
  assert.ok(stats.highlighted / stats.words < 0.5);
});

test('every substantial paragraph gets at least one highlight', () => {
  const filler = 'Some people simply went along with what everybody else there had already said before them anyway.';
  const input = [...ARTICLE, filler];
  const result = analyze(input, { density: 0.05 });
  input.forEach((block, i) => {
    if (typeof block === 'string') assert.ok(result.blocks[i].ranges.length >= 1, `block ${i} has no highlight`);
  });
});

test('adjacent highlights merge and absorb a single function word', () => {
  const input = ['Theory of mind matters. Theory of mind develops early. Children acquire theory of mind by age 4.'];
  const marked = highlightedText(input, analyze(input, { density: 0.4 }));
  assert.ok(marked.some((p) => /theory of mind/i.test(p)), marked.join(' | '));
});

test('ranges are sorted, non-overlapping and inside the block', () => {
  const result = analyze(ARTICLE, { density: 0.3 });
  result.blocks.forEach((b, i) => {
    const length = (typeof ARTICLE[i] === 'string' ? ARTICLE[i] : ARTICLE[i].text).length;
    let cursor = 0;
    for (const [s, e] of b.ranges) {
      assert.ok(s >= cursor && e > s && e <= length);
      cursor = e;
    }
  });
});

test('is deterministic and tolerates empty input', () => {
  assert.deepEqual(analyze(ARTICLE), analyze(ARTICLE));
  assert.deepEqual(analyze([]).stats, { words: 0, highlighted: 0, density: 0.2 });
  assert.deepEqual(analyze(['', '   ']).blocks, [{ ranges: [] }, { ranges: [] }]);
});
