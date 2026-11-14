import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyze } from '../src/core/analyze.js';
import { audit, coverage } from '../src/core/audit.js';
import { hasNegativeAffix, isNegation } from '../src/core/context-words.js';
import { DENSITIES, evaluate, MIN_KEY_RECALL, MIN_MEANING_RECALL } from '../eval/run.mjs';

const marks = (text, tier, options) => analyze([text], options).blocks[0][tier].map(([s, e]) => text.slice(s, e));

test('recognises negations, contractions and negative affixes', () => {
  for (const w of ['not', 'Never', "doesn't", 'won’t', 'without', 'unless']) assert.ok(isNegation(w), w);
  for (const w of ['note', 'know', 'another']) assert.ok(!isNegation(w), w);
  for (const w of ['unaided', 'non-fatal', 'useless', 'disagree', 'misleading']) assert.ok(hasNegativeAffix(w), w);
  for (const w of ['understand', 'unit', 'discuss', 'unless', 'mission', 'under']) assert.ok(!hasNegativeAffix(w), w);
});

test('a negation is underlined together with its auxiliary and the word it negates', () => {
  const text = 'The update does not delete your saved files. The update improves search speed and the update fixes login errors.';
  const context = marks(text, 'context');
  assert.ok(context.some((m) => m.startsWith('does not delete')), context.join(' | '));
});

test('negations are marked even in a sentence with no highlight', () => {
  const text = 'Photosynthesis feeds plants. Photosynthesis needs sunlight. Photosynthesis makes glucose. It is not what they said.';
  assert.ok(marks(text, 'context', { density: 0.05 }).some((m) => /\bnot\b/.test(m)));
});

test('negations and qualifiers are never painted as tier-1 highlights', () => {
  const text = 'Unless the tenant agrees, neither party may sublet. Only the landlord may enter, except in an emergency.';
  for (const m of marks(text, 'ranges', { density: 0.4 })) assert.ok(!/\b(unless|neither|only|except)\b/i.test(m), m);
});

test('the two tiers never overlap and never split a word', () => {
  for (const density of DENSITIES) {
    for (const row of evaluate(density)) {
      const structural = row.problems.filter((p) => p.rule === 'overlapping-marks' || p.rule === 'partial-word');
      assert.deepEqual(structural, [], row.name);
    }
  }
});

test('the audit catches a dropped negation', () => {
  const text = 'The drug did not reduce mortality.';
  const tampered = { blocks: [{ ranges: [[9, 12], [21, 27], [28, 37]], context: [] }] }; // "did", "reduce", "mortality"
  const rules = audit([text], tampered).map((p) => p.rule);
  assert.ok(rules.includes('negation-dropped'));
  assert.deepEqual(audit([text], analyze([text])), []);
});

test('coverage requires every word of a phrase to be marked', () => {
  const text = 'Black stools are a warning sign.';
  const partial = { blocks: [{ ranges: [[6, 12]], context: [] }] };
  assert.equal(coverage([text], partial, ['Black stools']).hit, 0);
  assert.equal(coverage([text], { blocks: [{ ranges: [[0, 12]], context: [] }] }, ['Black stools']).hit, 1);
});

test('evaluation set: no meaning distortions at any density, recall above the floor', () => {
  for (const density of DENSITIES) {
    const rows = evaluate(density);
    assert.deepEqual(rows.flatMap((r) => r.problems), [], `audit problems at ${density}`);
    if (density < 0.2) continue;
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    assert.ok(sum((r) => r.key.hit) / sum((r) => r.key.total) >= MIN_KEY_RECALL, `key-word recall at ${density}`);
    assert.ok(sum((r) => r.keep.hit) / sum((r) => r.keep.total) >= MIN_MEANING_RECALL, `meaning-word recall at ${density}`);
  }
});
