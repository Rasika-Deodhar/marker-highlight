// Dictionary: click a word in the reader to see a short meaning above it, with a link to
// its Wikipedia article. Off by default, because a lookup sends the clicked word to
// Wiktionary and Wikipedia (see src/dictionary/lookup.js). Nothing else leaves the tab.

import { tokenize } from '../src/core/text.js';
import { LOOKUP_NAME } from '../src/dom/highlighter.js';
import { lookup, normalizeTerm } from '../src/dictionary/lookup.js';

const $ = (id) => document.getElementById(id);
const MAX_PHRASE_WORDS = 5;

/**
 * @param {object} options
 * @param {HTMLElement} options.reader
 * @param {object} options.prefs  shared preferences: dictionary
 * @param {(patch: object) => void} options.set
 * @returns {{refresh(): void, close(): void}}
 */
export function setupDictionary({ reader, prefs, set }) {
  const button = $('dictionary');
  const card = $('dict');
  const title = $('dict-term');
  const body = $('dict-body');
  const cache = new Map();
  let request = null;
  let anchor = null; // the Range of the word the card is about

  function close() {
    request?.abort();
    request = null;
    anchor = null;
    card.hidden = true;
    CSS.highlights?.delete(LOOKUP_NAME);
  }

  /** Put the card above the word, or below it when there is no room above. */
  function place() {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const barBottom = document.querySelector('.bar').getBoundingClientRect().bottom;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 8), document.documentElement.clientWidth - width - 8);
    const above = rect.top - height - 10;
    const top = above >= barBottom + 4 ? above : rect.bottom + 10;
    card.style.left = `${Math.max(left, 8) + window.scrollX}px`;
    card.style.top = `${top + window.scrollY}px`;
    card.dataset.side = above >= barBottom + 4 ? 'above' : 'below';
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const link = (href, text) => {
    const a = el('a', null, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };

  function show(nodes) {
    body.replaceChildren(...nodes);
    place();
  }

  function render(result) {
    const nodes = [];
    for (const def of result.definitions) {
      const p = el('p', 'dict-def');
      if (def.partOfSpeech) p.append(el('em', null, def.partOfSpeech), ' ');
      p.append(def.text);
      nodes.push(p);
    }
    const wiki = result.wikipedia;
    if (wiki && !wiki.ambiguous && (wiki.extract || wiki.description) && result.definitions.length < 2) {
      // With no or one dictionary sense, the encyclopedia's opening lines are the meaning.
      nodes.push(el('p', 'dict-def', wiki.extract || wiki.description));
    }
    if (!nodes.length) nodes.push(el('p', 'dict-def', wiki?.ambiguous ? 'This has several meanings.' : 'No short meaning was found for this.'));

    const links = el('p', 'dict-links');
    if (wiki) {
      const label = wiki.ambiguous ? `“${wiki.title}” on Wikipedia (several meanings)` : `Wikipedia: ${wiki.title}`;
      links.append(link(wiki.url, label));
      if (wiki.description && !wiki.ambiguous) links.append(el('span', 'dict-note', ` — ${wiki.description}`));
    } else {
      links.append(link(result.searchUrl, `Search Wikipedia for “${result.term}”`));
    }
    nodes.push(links);
    if (result.wiktionaryUrl) {
      const source = el('p', 'dict-links dict-source');
      source.append('Meaning from ', link(result.wiktionaryUrl, 'Wiktionary'));
      nodes.push(source);
    }
    show(nodes);
  }

  async function open(term, range) {
    close();
    anchor = range;
    const highlight = new Highlight(range);
    highlight.priority = 2;
    CSS.highlights.set(LOOKUP_NAME, highlight);
    title.textContent = term;
    card.hidden = false;
    if (cache.has(term)) {
      render(cache.get(term));
      return;
    }
    show([el('p', 'dict-def dict-loading', 'Looking it up…')]);
    const mine = (request = new AbortController());
    try {
      const result = await lookup(term, { signal: mine.signal });
      if (request !== mine) return;
      cache.set(term, result);
      render(result);
    } catch (err) {
      if (request !== mine || mine.signal.aborted) return;
      show([el('p', 'dict-def dict-error', err?.message || 'The dictionary could not be reached.')]);
    }
  }

  /** The word under a point, as a Range, if the point is really on its glyphs. */
  function wordAt(x, y) {
    let node;
    let offset;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      node = pos?.offsetNode;
      offset = pos?.offset;
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      node = r?.startContainer;
      offset = r?.startOffset;
    }
    if (node?.nodeType !== Node.TEXT_NODE || !reader.contains(node)) return null;
    const token = tokenize(node.data).find((t) => t.start <= offset && offset <= t.end);
    if (!token) return null;
    const range = document.createRange();
    range.setStart(node, token.start);
    range.setEnd(node, token.end);
    // The caret snaps to the nearest character, so a click in a margin can land on a word.
    const hit = [...range.getClientRects()].some((r) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2);
    return hit ? { term: token.text, range } : null;
  }

  /** A short selected phrase ("eye tracking") is looked up as a whole. */
  function selectedPhrase() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!reader.contains(range.commonAncestorContainer)) return null;
    const text = selection.toString();
    const words = tokenize(text).length;
    if (!words || words > MAX_PHRASE_WORDS || /\n/.test(text.trim())) return null;
    return { term: text, range: range.cloneRange() };
  }

  reader.addEventListener('click', (e) => {
    if (!prefs.dictionary) return;
    const target = selectedPhrase() ?? wordAt(e.clientX, e.clientY);
    const term = target && normalizeTerm(target.term);
    if (!term) {
      close();
      return;
    }
    e.stopPropagation(); // keep the document-level "click outside" handler from closing it
    open(term, target.range);
  });
  button.addEventListener('click', () => set({ dictionary: !prefs.dictionary }));
  $('dict-close').addEventListener('click', close);
  document.addEventListener('click', (e) => {
    if (!card.hidden && !card.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !card.hidden) close();
  });
  window.addEventListener('resize', place);

  return {
    refresh() {
      button.setAttribute('aria-pressed', String(Boolean(prefs.dictionary)));
      reader.dataset.dictionary = Boolean(prefs.dictionary);
      if (!prefs.dictionary) close();
      // Re-analysis replaces nothing in the DOM, but a new document does: drop a stale card.
      else if (anchor && !reader.contains(anchor.startContainer)) close();
    },
    close,
  };
}
