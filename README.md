# Marker Highlight

Highlights only the most important words in a text, so you can skim it quickly without
leaving the original for a summary. Everything runs on your device.

![Marker Highlight showing an article with its key words highlighted](docs/screenshot.png)

It starts as a small web app and is built so the same engine can run as a browser
extension later, behind a toggle that reads a page only when you ask it to.

## Run it

Requires Node 20+ (only to serve the files; there are no dependencies to install).

```bash
npm start
```

Then open http://localhost:5173. Any static file server works too.

```bash
npm test
```

## Use it

- **New text**: paste text or open a `.txt`/`.md` file. Lines starting with `#` become headings.
- **Highlight** switch (or `H`): turn highlights on and off.
- **Fewer / More** (or `[` and `]`): how much is highlighted, from 5% to 40%.
- **Style**: marker or underline, colour, "underline context words" and "dim everything else".

There are two kinds of mark. **Marker** is for the important words themselves. A thinner
**underline** is for words that are not keywords but that the meaning depends on: "not",
"never", "only", "but", "unless", and the small words between highlights.

Use the highlights as a first pass to find what deserves a full read. Skimming keeps the
main ideas but not the reasoning between them.

## How it works

```
app/        UI shell (controls, preferences, text input)
src/dom/    reads text out of any DOM subtree, paints with the CSS Custom Highlight API
src/core/   the engine: text in, character ranges out; no DOM, no network
eval/       annotated texts and the evaluation runner
tests/      engine, context-tier and evaluation tests
```

The engine scores each word by frequency, spread, capitalisation, heading membership and
position, then selects a small share as whole phrases and guarantees every paragraph one
highlight. A second pass underlines every negation with the phrase it negates, plus
contrasts, qualifiers and in-between words. Painting does not modify the page's DOM.

`npm run eval` scores the engine on annotated texts and audits that no mark drops a
meaning-changing word. Current result at the default amount: 79% of key words fully
highlighted, 93% of meaning-critical phrases marked, zero audit findings.

## Documentation

- [Research and UX rationale](docs/RESEARCH.md): what reading research says and the design decision each finding led to, with sources.
- [System design and architecture](docs/ARCHITECTURE.md): layers, data flow, scoring model, extension mapping, decisions and limitations.
- [Evaluation](docs/EVALUATION.md): how coverage and meaning preservation are checked, current numbers, and what the checks cannot show.
- [Roadmap](docs/ROADMAP.md): phases from this app to a measured, multi-browser extension.

## Browser support

Chrome/Edge 105+, Safari 17.2+, Firefox 140+ (needs the CSS Custom Highlight API).
