# Roadmap

Each phase ends with something a person can use, and each has an exit test that decides
whether to move on.

## Phase 0: the app (this release, v0.1)

- Paste or open text; important words are highlighted in place, and the words that
  protect their meaning (negations, qualifiers, in-between words) are underlined.
- Evaluation set with an independent meaning audit, run by the tests.
- On/off switch, amount slider, marker and underline styles, four colours, dim mode,
  keyboard shortcuts, light and dark themes.
- Engine with unit tests; research, architecture and decisions documented.

## Phase 1: make the highlights trustworthy

The product is only as good as what it marks, and so far that is measured only on a small
set written by the engine's author.

- **Independent evaluation set.** Today's set ([EVALUATION.md](EVALUATION.md)) is six
  texts annotated by the engine's author. Grow it to 30–50 texts of different kinds,
  annotated by other people, with a held-out portion never used for tuning. Report
  precision as well as recall, and run it in CI.
- **Tune weights** against that set instead of by inspection.
- **Phrase quality.** Use part-of-speech information so phrases are true noun phrases and
  single-use key terms are found. Extend negation scope beyond four words and handle
  double negatives.
- **Languages.** `Intl.Segmenter` tokenising; stopword and common-word lists for the next
  three languages by demand; detect language from the text.
- **More inputs.** Paste rich text with its headings and lists preserved; open PDF and
  EPUB; load a URL where cross-origin rules allow.
- **Automated browser tests** for the DOM adapter and the UI.
- Installable offline (PWA manifest and service worker).

*Exit test:* on the held-out set, at 20% density, at least 90% of key words are fully
highlighted (today: 79% on the author-annotated set) with zero meaning-audit findings.

## Phase 2: the browser extension

- Manifest V3, `activeTab` + `scripting` only. Toolbar button and keyboard shortcut
  toggle highlights on the current tab; nothing runs before that.
- Bundle core + adapter into a content script; inject the `::highlight` CSS.
- Main-content detection so navigation, sidebars, comments and ads are ignored.
- Popup with the same controls as the app; preferences in `chrome.storage.sync`.
- Handle pages that change after load (re-analyse on mutation, debounced) and text inside
  open shadow roots.
- Optional "always on for this site", requested per site when the user asks for it.
- Chrome and Edge first, then Firefox and Safari.

*Exit test:* works correctly on 50 popular article, documentation and news sites without
visibly altering layout, and turning it off leaves the DOM identical to before.

## Phase 3: reading aids around the highlights

- Jump to next/previous highlight from the keyboard.
- A key-terms strip that links to where each term is discussed.
- Per-paragraph "show more here" for readers who want detail in one place only.
- Copy or export the highlighted phrases as notes.
- Reader-controlled presets (font, spacing, colours) aimed at dyslexic and low-vision
  readers, designed with those readers.

## Phase 4: measure it, then consider smarter ranking

- **Reader study.** Same texts with and without highlights; measure time, recall of main
  ideas and inference questions. Publish the result, whichever way it goes.
- **Optional on-device model** (sentence embeddings or a browser's built-in model) behind
  the existing `analyze()` contract, off by default, with the statistical engine as the
  fallback. Adopt only if it beats the Phase 1 engine on the evaluation set.

## Not planned

- Generated summaries or rewritten text. The product's premise is keeping the original.
- Sending page text to a server by default.
- One-word-at-a-time (RSVP) display or partial-word bolding; see [RESEARCH.md](RESEARCH.md).
- Accounts, sync of reading history, or analytics on what people read.

## How success is measured

| Question | Measure |
|---|---|
| Are the right words marked? | Precision/recall against the human-marked evaluation set |
| Does it help? | Phase 4 study: main-idea recall per minute spent, with vs. without |
| Is it safe on real pages? | Sites in the Phase 2 test list with zero layout or behaviour changes |
| Do people keep it on? | In the extension, opt-in local counter of on vs. off toggles; never page content |
