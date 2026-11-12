// App shell. Owns UI state and the reader; delegates all text analysis to the engine via
// the DOM adapter. An extension popup/content script would replace this file only.

import { createHighlighter, isSupported } from '../src/dom/highlighter.js';
import { SAMPLE } from './sample.js';

const WORDS_PER_MINUTE = 238; // average adult silent reading rate for non-fiction (Brysbaert, 2019)
const PREFS_KEY = 'marker-highlight:prefs';

const $ = (id) => document.getElementById(id);
const reader = $('reader');
const toggle = $('toggle');
const density = $('density');
const dim = $('dim');
const stats = $('stats');
const composer = $('composer');
const source = $('source');

const highlighter = createHighlighter(reader);
const supported = isSupported();
const prefs = { on: true, density: 20, dim: false, mark: 'marker', color: 'yellow', ...loadPrefs() };

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) ?? {};
  } catch {
    return {};
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience; the app works without storage.
  }
}

/** Plain text -> headings and paragraphs. Uses textContent only, so pasted text is never parsed as HTML. */
function renderText(text) {
  const chunks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
  const nodes = chunks.map((chunk, i) => {
    const heading = chunk.match(/^(#{1,6})\s+(.*)$/s);
    const looksLikeTitle = !chunk.includes('\n') && chunk.length <= 90 && !/[.!?:;,]$/.test(chunk);
    let tag = 'p';
    let content = chunk;
    if (heading) {
      tag = heading[1].length === 1 ? 'h1' : 'h2';
      content = heading[2];
    } else if (looksLikeTitle && chunks.length > 1) {
      tag = i === 0 ? 'h1' : 'h2';
    }
    const el = document.createElement(tag);
    el.textContent = content;
    return el;
  });
  reader.replaceChildren(...nodes);
  window.scrollTo(0, 0);
  update();
}

function update() {
  const on = prefs.on && supported;
  toggle.setAttribute('aria-checked', String(on));
  density.value = prefs.density;
  density.disabled = !on;
  dim.checked = prefs.dim;
  reader.classList.toggle('is-on', on);
  reader.dataset.dim = prefs.dim;
  reader.dataset.mark = prefs.mark;
  reader.dataset.color = prefs.color;
  for (const name of ['mark', 'color']) {
    const input = document.querySelector(`input[name="${name}"][value="${prefs[name]}"]`);
    if (input) input.checked = true;
  }

  // The engine always runs (it is cheap) so the word count is available either way.
  const result = highlighter.apply({ density: prefs.density / 100 });
  if (!on) highlighter.clear();

  const { words, highlighted } = result.stats;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  const parts = [`${words.toLocaleString()} words`, `about ${minutes} min to read in full`];
  if (on && words) parts.push(`${highlighted.toLocaleString()} highlighted (${Math.round((highlighted / words) * 100)}%)`);
  stats.textContent = words ? parts.join(' · ') : '';
  savePrefs();
}

function set(patch) {
  Object.assign(prefs, patch);
  update();
}

toggle.addEventListener('click', () => set({ on: !prefs.on }));
density.addEventListener('input', () => set({ density: Number(density.value) }));
dim.addEventListener('change', () => set({ dim: dim.checked }));
for (const input of document.querySelectorAll('input[name="mark"], input[name="color"]')) {
  input.addEventListener('change', () => set({ [input.name]: input.value }));
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, dialog')) return;
  const step = Number(density.step);
  if (e.key === 'h' || e.key === 'H') set({ on: !prefs.on });
  else if (e.key === '[' && prefs.on) set({ density: Math.max(Number(density.min), prefs.density - step) });
  else if (e.key === ']' && prefs.on) set({ density: Math.min(Number(density.max), prefs.density + step) });
});

// Close the style menu when focus or a click lands outside it.
const menu = $('style-menu');
document.addEventListener('click', (e) => {
  if (!menu.contains(e.target)) menu.open = false;
});
menu.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});

$('new-text').addEventListener('click', () => {
  source.value = '';
  composer.showModal();
  source.focus();
});
$('use-sample').addEventListener('click', () => {
  source.value = SAMPLE;
});
$('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) source.value = await file.text();
  e.target.value = '';
});
composer.addEventListener('close', () => {
  if (composer.returnValue === 'read' && source.value.trim()) renderText(source.value);
});

if (!supported) {
  $('unsupported').hidden = false;
  toggle.disabled = true;
}
renderText(SAMPLE);
