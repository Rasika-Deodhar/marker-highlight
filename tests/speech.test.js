import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQueue, splitSentences } from '../src/speech/queue.js';
import { createSpeaker, rankVoices } from '../src/speech/speaker.js';
import { analyze } from '../src/core/analyze.js';

test('splitSentences: one range per sentence, abbreviations kept together', () => {
  const text = 'Dr. Smith read 3.5 pages. "Was it enough?" he asked.  It was not!';
  assert.deepEqual(
    splitSentences(text).map(([s, e]) => text.slice(s, e)),
    ['Dr. Smith read 3.5 pages.', '"Was it enough?"', 'he asked.', 'It was not!'],
  );
  assert.deepEqual(splitSentences('   '), []);
});

test('buildQueue: "all" reads every sentence; "quick" reads only the marks, headings in full', () => {
  const body = 'Skimming is not laziness. It saves limited attention.';
  const at = (word) => [body.indexOf(word), body.indexOf(word) + word.length];
  const blocks = [
    { text: 'Why it works', kind: 'heading', ranges: [], context: [] },
    { text: body, kind: 'body', ranges: [at('Skimming'), at('laziness'), at('limited attention')], context: [at('not')] },
    { text: 'Nothing marked here.', kind: 'body', ranges: [], context: [] },
  ];
  assert.deepEqual(buildQueue(blocks, 'all').map((c) => c.text), [
    'Why it works',
    'Skimming is not laziness.',
    'It saves limited attention.',
    'Nothing marked here.',
  ]);
  const quick = buildQueue(blocks, 'quick');
  // "not laziness" is one phrase: the context word is adjacent to the highlight.
  assert.deepEqual(quick.map((c) => c.text), ['Why it works', 'Skimming, not laziness', 'limited attention']);
  assert.deepEqual(quick[1].ranges.map(([s, e]) => body.slice(s, e)), ['Skimming', 'not laziness']);
  assert.equal(quick[2].block, 1);
});

test('buildQueue: works on real engine output and never speaks text outside its ranges', () => {
  const blocks = [{ text: 'Readers do not read every word. They scan a page for the phrases that carry its meaning.', kind: 'body' }];
  const result = analyze(blocks, { density: 0.2, context: true });
  const marked = blocks.map((b, i) => ({ ...b, ...result.blocks[i] }));
  const quick = buildQueue(marked, 'quick');
  assert.ok(quick.length > 0);
  for (const chunk of quick) {
    assert.equal(chunk.text, chunk.ranges.map(([s, e]) => blocks[0].text.slice(s, e)).join(', '));
  }
  assert.ok(quick.map((c) => c.text).join(' ').length < blocks[0].text.length);
});

/** A synthesiser that speaks instantly when told to, so the queue logic can be stepped. */
function fakeSynth() {
  const spoken = [];
  let current = null;
  return {
    spoken,
    synth: {
      speak(u) {
        current = u;
        spoken.push({ text: u.text, rate: u.rate });
      },
      cancel() {
        const u = current;
        current = null;
        u?.onerror?.({ error: 'interrupted' });
      },
    },
    Utterance: class {
      constructor(text) {
        this.text = text;
      }
    },
    finish() {
      const u = current;
      current = null;
      u.onend();
    },
  };
}

test('speaker: plays the queue in order, reports the chunk, and goes idle at the end', () => {
  const fake = fakeSynth();
  const chunks = [];
  const states = [];
  const speaker = createSpeaker({ ...fake, onChunk: (i) => chunks.push(i), onState: (s) => states.push(s) });
  const queue = [{ text: 'one' }, { text: 'two' }, { text: 'three' }];
  speaker.play(queue, 1);
  fake.finish();
  fake.finish();
  assert.deepEqual(fake.spoken.map((s) => s.text), ['two', 'three']);
  assert.deepEqual(chunks, [1, 2, -1]);
  assert.deepEqual(states, ['playing', 'idle']);
});

test('speaker: pause keeps its place, a speed change restarts the sentence, stop resets', () => {
  const fake = fakeSynth();
  const speaker = createSpeaker(fake);
  speaker.play([{ text: 'one' }, { text: 'two' }]);
  speaker.pause();
  assert.equal(speaker.state, 'paused');
  speaker.setRate(2);
  assert.equal(fake.spoken.length, 1, 'changing speed while paused does not speak');
  speaker.resume();
  assert.deepEqual(fake.spoken.at(-1), { text: 'one', rate: 2 });
  speaker.setRate(9);
  assert.deepEqual(fake.spoken.at(-1), { text: 'one', rate: 3 }, 'restarted, clamped to the maximum');
  fake.finish();
  assert.equal(fake.spoken.at(-1).text, 'two');
  speaker.skip(-1);
  assert.equal(fake.spoken.at(-1).text, 'one');
  speaker.stop();
  assert.equal(speaker.state, 'idle');
  assert.equal(speaker.index, -1);
});

test('rankVoices: language match first, on-device before network voices', () => {
  const voices = [
    { name: 'Online', lang: 'en-US', localService: false, default: false },
    { name: 'Deutsch', lang: 'de-DE', localService: true, default: true },
    { name: 'Local', lang: 'en-GB', localService: true, default: false },
  ];
  assert.deepEqual(rankVoices(voices, 'en').map((v) => v.name), ['Local', 'Online']);
  assert.deepEqual(rankVoices(voices, 'fr').map((v) => v.name), ['Deutsch', 'Local', 'Online']);
});
