# System design and architecture

## Goals and constraints

- **Lightweight.** No framework, no dependencies, no build step. Under 1,000 lines of source.
- **Faithful.** The text is never altered, and following the marks must not change what a
  sentence says.
- **Private.** Text is analysed where it is displayed. Nothing is sent or stored.
- **Extension-ready.** The app is the first host; a browser extension is the second. Moving
  to the extension must not require rewriting the engine or the painting code.
- **Reversible.** Turning highlights off restores the page exactly.

## Layers

```mermaid
flowchart TD
  subgraph Host["Host (one per product surface)"]
    APP["Web app shell<br/>index.html, app/app.js"]
    EXT["Extension shell (planned)<br/>service worker + content script"]
  end
  subgraph Adapter["DOM adapter: src/dom/highlighter.js"]
    COLLECT["collectBlocks(root)<br/>text nodes → blocks + offset map"]
    PAINT["CSS Custom Highlight API<br/>ranges → ::highlight()"]
  end
  subgraph Core["Core engine: src/core (pure, no DOM)"]
    TOK["text.js<br/>tokens, sentences, term keys"]
    AN["analyze.js<br/>score → select → add context → merge"]
    SW["stopwords.js, context-words.js"]
    AU["audit.js<br/>independent meaning check"]
  end
  APP --> COLLECT
  EXT -.-> COLLECT
  COLLECT -->|"blocks: {text, kind}[]"| AN
  AN --> TOK
  AN --> SW
  AN -->|"marker ranges + context ranges, stats"| PAINT
  AN -.->|"checked in tests and npm run eval"| AU
  PAINT --> APP
```

| Layer | Files | Knows about | Does not know about |
|---|---|---|---|
| Core engine | `src/core/*` | Strings, offsets | DOM, browser, UI, storage |
| DOM adapter | `src/dom/highlighter.js` | Any DOM subtree, the Highlight API | Where the DOM came from, UI state |
| Host shell | `app/*`, `index.html` | Controls, preferences, text input | How importance is computed |

The dependency direction is strictly downward. The contract between adapter and core is
one function:

```js
analyze(blocks: ({ text, kind?: 'body' | 'heading' } | string)[], { density, context, stopwords, commonWords })
  → { blocks: { ranges: [start, end][], context: [start, end][] }[],
      stats: { words, highlighted, context, density }, keywords }
```

`ranges` are tier 1 (the important words, painted as marker). `context` are tier 2 (words
that keep tier 1 truthful, painted as underline). The tiers never overlap. Both are
character offsets into each block's `text`. Anything that can produce blocks
and consume ranges can host the engine: a web page, a PDF text layer, an e-reader, a CLI.

## Data flow for one toggle

1. The user turns the switch on (or changes the amount).
2. `collectBlocks(root)` walks the subtree with a `TreeWalker`. It rejects subtrees that
   are not prose (`script`, `code`, `pre`, form controls, `nav`, hidden and editable
   elements), groups consecutive text nodes under their nearest non-inline ancestor into a
   block, and records where each text node starts within the block's text.
3. `analyze(blocks, { density })` returns ranges.
4. Each range is mapped back to a DOM `Range` through the offset map (binary search) and
   added to one of two `Highlight` objects, registered as `marker-highlight` (tier 1) and
   `marker-highlight-context` (tier 2).
5. CSS paints them: `::highlight(marker-highlight) { background-color: … }` and
   `::highlight(marker-highlight-context) { text-decoration: underline … }`.
6. Off: both registrations are deleted. The DOM was never modified.

## Scoring model

Single-document, unsupervised and deterministic, in the family of YAKE, RAKE and TextRank
(references 18–20 in [RESEARCH.md](RESEARCH.md)). It is a heuristic and its weights were
set by inspection, not trained.

**Term score** (one per distinct word, after folding case, plurals and possessives):

| Signal | Weight | Reasoning |
|---|---|---|
| Frequency, `log(1+tf)` normalised | 0.35 | Repeated terms are the topic |
| Spread across paragraphs | 0.15 | Topic terms recur throughout; incidental ones cluster |
| Mid-sentence capitalisation, acronyms | 0.20 | Names of people, places, things |
| Appears in a heading | 0.15 | The author's own importance signal |
| Inside a multi-word term | 0.06 | Words in content-word runs ("security review") tend to be subject matter (RAKE) |
| Word length | 0.08 | Longer words are rarer; a stand-in for corpus rarity |
| Early first mention | 0.03 | Key ideas are introduced first |

Adjustments: function words (stopwords) score zero. Everyday content words ("people",
"time", "way") are discounted by 0.55 as a substitute for corpus IDF. Numbers skip the
formula and get a fixed 0.55 (0.45 for a single digit), because figures are dense facts
however rarely they occur. Negations, contrasts and qualifiers are excluded from tier 1;
they belong to tier 2.

**Occurrence score** (one per word on the page) = term score, scaled by how important the
sentence is (sum of its term scores over the square root of its length), ×1.15 in a
paragraph's first sentence, and decayed for each earlier occurrence of the same term in
the paragraph (×0.6) and in the document (×0.7, floor 0.3).

**Selection (tier 1).** Occurrences are taken in score order until `density × word count`
words are selected. A word inside a run of two or three content words is taken with the
whole run or not at all, so "black stools" is never reduced to "stools". Then every body
paragraph of 12+ words with nothing selected gets its best term, and a number takes the
word after it ("79 percent", "400 mg"). These rules can push the final share a few points
above the requested density; the tests bound this.

**Context (tier 2).** Added after selection, outside the density budget, because these
words are not optional:

1. Every negation in the text ("not", "never", "no", "without", "unless", "n't"…) is
   marked with the auxiliary before it and the phrase it negates: "does not delete",
   "without the prior written consent". This applies even in sentences with no highlight,
   so no negated statement is invisible to a skimmer.
2. In a sentence that has marks, contrast words are marked ("but", "however", "although").
3. A qualifier ("only", "most", "few", "until", "may"…) or a negative-prefixed word
   ("unaided", "non-fatal", "useless") directly before a marked word is marked.
4. One or two function words stranded between marked words are marked, so phrases read
   whole ("speed and comprehension", "risk of heart disease").

The word lists live in `src/core/context-words.js`. `src/core/audit.js` re-checks rules
1–3 on the engine's output with separate code; see [EVALUATION.md](EVALUATION.md).

Each of these rules traces to a finding in [RESEARCH.md](RESEARCH.md#from-findings-to-design).

## Mapping to a browser extension

| App today | Extension (Manifest V3) |
|---|---|
| `app/app.js` reads controls, calls the highlighter | Service worker handles the toolbar click and keyboard command; popup holds the same controls |
| Highlighter root = `#reader` | Root = the page's main content (`<article>`, `<main>`, else `document.body`) |
| Text comes from paste or file | Text is already in the page |
| CSS in `app/styles.css` | The `::highlight` rules injected with `scripting.insertCSS` |
| Preferences in `localStorage` | `chrome.storage.sync` |
| Modules loaded natively | Core + adapter bundled into one content script (content scripts cannot be ES modules) |

Permission model: `activeTab` + `scripting` only. The extension has no access to any page
until the user clicks its button or presses its shortcut, access covers that tab only, and
installing it shows no "read all your data" warning. This is the "toggle with permission"
behaviour the product needs. Remembering the setting per site would need optional host
permissions, requested at the moment the user asks for it.

## Decisions

**D1. Highlight in place; do not summarise.** Readers who dislike leaving the original
text for a summary are the audience. In-place marks keep context and allow re-reading,
which the research says matters. Consequence: the tool cannot shorten a text, only guide
the eye through it.

**D2. Statistical engine on the device; no language model, no server.** Instant, free to
run, works offline, deterministic, and nothing leaves the device. Cost: it has no real
understanding. It cannot tell a crucial "not" from a routine one and is weakest on short
texts, where frequency carries little signal. The `analyze()` contract is where a better
ranker can be swapped in later without touching the rest.

**D3. The core has no DOM access.** It is testable in Node in milliseconds and portable to
a worker or an extension. Cost: the adapter must maintain an offset map between block text
and text nodes.

**D4. Paint with the CSS Custom Highlight API, not wrapper elements.** Wrapping words in
`<mark>` or `<span>` changes the page's DOM, which can break a host page's scripts,
selectors and editors, and must be undone node by node. The Highlight API paints ranges
without touching the DOM, so "off" is one call. Costs: only a few properties can be styled
(colours, text decoration, shadow; not font weight), highlights are not announced by
screen readers, and it needs Chrome/Edge 105+, Safari 17.2+ or Firefox 140+. Older
browsers get a notice and a disabled switch. A `<mark>` fallback was not built.

**D5. No build step and no dependencies for the app.** The whole product is static files;
any static host serves it. A bundler arrives only with the extension, where it is required.

**D6. Density is bounded to 5–40%, default 20%.** Sparse marks are the mechanism. The
bounds are enforced in the engine, not only in the slider.

**D7. Headings are evidence, not targets.** Heading words raise term scores but headings
are not marked and do not count toward the word total.

**D8. User text is never persisted and never parsed as HTML.** Only display preferences go
to `localStorage`. Input is inserted with `textContent`, so pasted markup cannot execute.

**D9. Tokenisation uses a Unicode regular expression.** Works for scripts that separate
words with spaces. Chinese, Japanese and Thai need `Intl.Segmenter`, and every language
needs its own stopword list; both are roadmap items and both are injectable today.

**D11. Two tiers instead of one.** Statistically important words and meaning-critical
words are different sets: "not" is never a keyword and always matters. Making negations
tier-1 highlights would spend the sparse marker budget on function words and bury the
real key terms; leaving them out lets the marks misstate the text. So tier 1 stays sparse
and budgeted, and tier 2 is a quieter underline that is unbudgeted and rule-driven. Cost:
on text dense with negations and conditions (legal, medical), a third of the words can end
up underlined. The underline can be switched off in the Style menu.

**D12. Whole phrases or nothing.** A short multi-word term is selected as a unit. Cost:
without part-of-speech tagging a "phrase" is any run of content words, so some are
verb-noun fragments ("readers take"), and phrases cover fewer distinct ideas per budget.

**D13. Meaning preservation is enforced by an independent audit.** The audit shares word
lists with the engine but not its selection logic, runs in `npm test`, and must report
zero findings. It verifies known distortion patterns only; it is not a proof.

**D10. Re-analyse on every change.** Analysis is linear in text length apart from one
sort, and takes milliseconds for article-length text, so there is no cache to invalidate.
Book-length input should move to a Web Worker.

## Known limitations

- English only in practice (D9).
- Sentence splitting and plural folding are simple rules and make occasional mistakes.
- Terms used only once in a short text are the engine's main blind spot: at the default
  amount it covers 79% of the annotated key words in the evaluation set.
- Negation handling is local: it reaches four words past the negation and does not
  understand double negatives, sarcasm or scope across clauses.
- Paragraphs with no distinctive terms receive only the single guaranteed highlight.
- The adapter decides what is a block from tag names, not computed styles. Pages that
  build paragraphs from styled `<span>`s will be read as one long block.
- The app accepts plain text and Markdown-style `#` headings only; no URL, HTML or PDF
  import yet.
- Effect on reading speed and comprehension is unmeasured.

## Testing

`npm test` runs the engine's unit tests in Node (tokenising, term folding, sentence
breaks, stopword exclusion, heading handling, density bounds, paragraph coverage, whole
phrases, range validity, determinism), the context-tier tests, and the evaluation set with
its meaning audit and recall floors. `npm run eval` prints the full evaluation report;
see [EVALUATION.md](EVALUATION.md). The DOM adapter and UI were checked in headless
Chromium by hand-written script during development; automated browser tests are a roadmap
item.
