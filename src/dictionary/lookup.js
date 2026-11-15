// Looks a word up: a short definition from Wiktionary and the matching Wikipedia article.
//
// This is the one feature that talks to the network. It is off until the reader turns the
// dictionary on, and then sends only the word they click, never the surrounding text.
// Both services are run by the Wikimedia Foundation and allow cross-origin requests.

const WIKTIONARY = 'https://en.wiktionary.org';
const WIKIPEDIA = 'https://en.wikipedia.org';
const MAX_DEFINITIONS = 3;

/** Trim punctuation and possessives from what the reader clicked or selected. */
export function normalizeTerm(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/['’]s$/i, '')
    .slice(0, 80);
}

export const wikipediaSearchUrl = (term) => `${WIKIPEDIA}/wiki/Special:Search?search=${encodeURIComponent(term)}`;

/**
 * @param {string} raw
 * @param {{fetch?: typeof fetch, signal?: AbortSignal}} [options]
 * @returns {Promise<{
 *   term: string,
 *   definitions: {partOfSpeech: string, text: string}[],
 *   wiktionaryUrl: string|null,
 *   wikipedia: {title: string, description: string, extract: string, url: string, ambiguous: boolean}|null,
 *   searchUrl: string,
 * }>}
 *   Rejects only when neither service could be reached.
 */
export async function lookup(raw, { fetch: fetchFn = globalThis.fetch, signal } = {}) {
  const term = normalizeTerm(raw);
  if (!term) throw new Error('Nothing to look up.');
  const getJson = async (url) => {
    const res = await fetchFn(url, { signal, headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  // Wiktionary titles are case-sensitive ("Paris" and "paris" are different entries), so
  // try the word as written, then in lower case for a word capitalised by its sentence.
  const forms = [...new Set([term, term.toLowerCase()])];
  const define = async () => {
    for (const form of forms) {
      const data = await getJson(`${WIKTIONARY}/api/rest_v1/page/definition/${encodeURIComponent(form.replace(/ /g, '_'))}?redirect=true`);
      const definitions = pickDefinitions(data);
      if (definitions.length) {
        return { definitions, wiktionaryUrl: `${WIKTIONARY}/wiki/${encodeURIComponent(form.replace(/ /g, '_'))}#English` };
      }
    }
    return { definitions: [], wiktionaryUrl: null };
  };
  const summarize = async () => {
    const data = await getJson(`${WIKIPEDIA}/api/rest_v1/page/summary/${encodeURIComponent(term.replace(/ /g, '_'))}?redirect=true`);
    if (!data?.title) return null;
    return {
      title: data.title,
      description: data.description ?? '',
      extract: firstSentences(data.extract ?? '', 2),
      url: data.content_urls?.desktop?.page ?? `${WIKIPEDIA}/wiki/${encodeURIComponent(data.title.replace(/ /g, '_'))}`,
      ambiguous: data.type === 'disambiguation',
    };
  };

  const [dictionary, encyclopedia] = await Promise.allSettled([define(), summarize()]);
  if (dictionary.status === 'rejected' && encyclopedia.status === 'rejected') {
    if (signal?.aborted) throw dictionary.reason;
    throw new Error('The dictionary could not be reached. Check your connection and try again.');
  }
  return {
    term,
    definitions: dictionary.value?.definitions ?? [],
    wiktionaryUrl: dictionary.value?.wiktionaryUrl ?? null,
    wikipedia: encyclopedia.value ?? null,
    searchUrl: wikipediaSearchUrl(term),
  };
}

/** The first few English senses, as plain text. */
function pickDefinitions(data) {
  const out = [];
  for (const entry of data?.en ?? []) {
    for (const sense of entry.definitions ?? []) {
      const text = plainText(sense.definition);
      if (!text) continue;
      out.push({ partOfSpeech: String(entry.partOfSpeech ?? '').toLowerCase(), text });
      break; // one sense per part of speech keeps the card short
    }
    if (out.length >= MAX_DEFINITIONS) break;
  }
  return out;
}

/** Definitions arrive as HTML fragments. Only their text is kept; nothing is rendered as markup. */
export function plainText(html) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(html ?? '')
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
      if (name[0] !== '#') return named[name.toLowerCase()] ?? match;
      const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentences(text, count) {
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  if (!sentences) return text.trim();
  // Do not stop inside an abbreviation or initial ("b. 1950", "J. K. Rowling").
  const out = [];
  let pending = '';
  for (const s of sentences) {
    pending += s;
    if (/(?:^|\s)\p{L}{1,2}\.$/u.test(pending.trim()) || /\b(?:Dr|Mr|Mrs|Ms|St|vs|etc)\.$/.test(pending.trim())) continue;
    out.push(pending.trim());
    pending = '';
    if (out.length === count) break;
  }
  return (out.length ? out.join(' ') : pending.trim()) || text.trim();
}
