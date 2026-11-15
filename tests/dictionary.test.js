import test from 'node:test';
import assert from 'node:assert/strict';

import { lookup, normalizeTerm, plainText } from '../src/dictionary/lookup.js';

/** fetch stand-in: maps a URL substring to [status, body]. */
function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([key]) => url.includes(key));
    if (!hit) return { status: 404, ok: false, json: async () => ({}) };
    const [status, body] = hit[1];
    if (status === 0) throw new TypeError('Failed to fetch');
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { fetch, calls };
}

test('normalizeTerm: strips punctuation and possessives', () => {
  assert.equal(normalizeTerm('“comprehension,”'), 'comprehension');
  assert.equal(normalizeTerm("  reader's "), 'reader');
  assert.equal(normalizeTerm('eye-tracking'), 'eye-tracking');
  assert.equal(normalizeTerm('...'), '');
});

test('plainText: keeps text only and decodes entities', () => {
  assert.equal(plainText('To <a href="/wiki/read">read</a> &amp; skip<style>.x{}</style>&nbsp;quickly&#33;'), 'To read & skip quickly!');
  assert.equal(plainText('<img src=x onerror=alert(1)>safe'), 'safe');
});

test('lookup: definition from Wiktionary (lower-cased retry) and summary from Wikipedia', async () => {
  const { fetch, calls } = fakeFetch({
    'wiktionary.org/api/rest_v1/page/definition/skimming': [
      200,
      {
        en: [
          { partOfSpeech: 'Noun', definitions: [{ definition: '' }, { definition: 'The act of <b>reading</b> quickly.' }, { definition: 'second sense' }] },
          { partOfSpeech: 'Verb', definitions: [{ definition: 'present participle of <i>skim</i>' }] },
        ],
        fr: [{ partOfSpeech: 'Nom', definitions: [{ definition: 'french' }] }],
      },
    ],
    'wikipedia.org/api/rest_v1/page/summary/Skimming': [
      200,
      {
        type: 'standard',
        title: 'Skimming (reading)',
        description: 'Reading technique',
        extract: 'Skimming is a process of speed reading. It was studied by J. K. Example. A third sentence. A fourth.',
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Skimming_(reading)' } },
      },
    ],
  });
  const result = await lookup('Skimming.', { fetch });
  assert.equal(result.term, 'Skimming');
  assert.deepEqual(result.definitions, [
    { partOfSpeech: 'noun', text: 'The act of reading quickly.' },
    { partOfSpeech: 'verb', text: 'present participle of skim' },
  ]);
  assert.equal(result.wiktionaryUrl, 'https://en.wiktionary.org/wiki/skimming#English');
  assert.equal(result.wikipedia.url, 'https://en.wikipedia.org/wiki/Skimming_(reading)');
  assert.equal(result.wikipedia.extract, 'Skimming is a process of speed reading. It was studied by J. K. Example.');
  assert.ok(calls.every((url) => /^https:\/\/en\.wik(tionary|ipedia)\.org\//.test(url)), 'only the two services are contacted');
  assert.ok(calls.every((url) => !/reading%20quickly/.test(url)));
});

test('lookup: nothing found gives an empty result with a search link; total failure rejects', async () => {
  const none = await lookup('zzxqy', fakeFetch({}));
  assert.deepEqual(none.definitions, []);
  assert.equal(none.wikipedia, null);
  assert.equal(none.searchUrl, 'https://en.wikipedia.org/wiki/Special:Search?search=zzxqy');

  const half = await lookup('word', fakeFetch({ wiktionary: [0], 'wikipedia.org': [200, { type: 'disambiguation', title: 'Word' }] }));
  assert.deepEqual(half.definitions, []);
  assert.equal(half.wikipedia.ambiguous, true);
  assert.equal(half.wikipedia.url, 'https://en.wikipedia.org/wiki/Word');

  await assert.rejects(lookup('word', fakeFetch({ wik: [0] })), /could not be reached/);
  await assert.rejects(lookup('word', fakeFetch({ wik: [500, {}] })), /could not be reached/);
  await assert.rejects(lookup('?!', fakeFetch({})), /Nothing to look up/);
});
