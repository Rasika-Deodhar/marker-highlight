# Evaluation: are the right words marked, and is the meaning intact?

The product makes two promises. This document says how each is checked, what the current
numbers are, and what the checks cannot tell you.

1. **The exact important words are covered** (tier 1, marker).
2. **Following the marks never changes what a sentence says** (tier 2, underline, exists
   for this).

Run the evaluation:

```bash
npm run eval
```

Print every evaluation text with its marks, to judge by eye (`[[marker]]`, `__underline__`):

```bash
node eval/show.mjs 0.2
```

`npm test` runs the same checks and fails on any regression.

## What is checked

### A. Meaning audit (`src/core/audit.js`)

The audit is separate code from the engine. It re-reads the text, looks only at which
characters ended up marked, and reports every case of these distortion patterns:

| Rule | What it catches | Example of the failure |
|---|---|---|
| `negation-dropped` | A negation word left unmarked, anywhere in the text | "did not improve" marked as "improve" |
| `negated-word-dropped` | The negation is marked but the word it negates is not | "not" underlined, "delete" unmarked |
| `contrast-dropped` | "but", "however", "although"… unmarked in a sentence that has marks | Both halves marked, the turn between them lost |
| `negative-modifier-dropped` | An un-/non-/dis-/mis-/-less word unmarked directly before a marked word | "unaided skimming" marked as "skimming" |
| `qualifier-dropped` | "only", "most", "few", "until", "may"… unmarked directly before a marked word | "only 16 percent" marked as "16 percent" |
| `partial-word`, `overlapping-marks` | A mark that splits a word, or two marks on the same text | |

The pass condition is **zero findings at every density**. One test feeds the audit a
deliberately broken result to prove it detects a dropped negation.

### B. Annotated texts (`eval/fixtures.js`)

Six short texts chosen because distortion would matter in them: a medication leaflet, a
tenancy clause, a science news item, software documentation, a work email and a history
explainer. They are dense with negations and conditions on purpose. Each is annotated with:

- **key words**: the exact terms a careful reader would insist on (names, amounts, dates,
  subject terms). A key word counts only if *every* word of it is highlighted in tier 1;
  "black stools" reduced to "stools" is a miss.
- **meaning words**: the phrases that carry a negation, condition or contrast ("does not
  delete", "without the prior written consent", "unless"). Counted if fully marked in
  either tier.

The app's own sample text is included for meaning words.

### C. The page itself is untouched

Marks are painted over the text; no element is added and no character changes. Checked in
headless Chromium: the reader's HTML is byte-identical with highlights on and off.

## Current results

| Requested density | Key words covered | Meaning words covered | Audit findings |
|---|---|---|---|
| 10% | 58% (22/38) | 85% | 0 |
| 20% (default) | 79% (30/38) | 93% | 0 |
| 30% | 92% (35/38) | 96% | 0 |

Regression floors enforced at 20% and above: key words ≥ 75%, meaning words ≥ 90%, audit
findings = 0 (at all densities).

What these numbers say:

- **Meaning protection works on the patterns it knows.** Every negation in every text is
  marked together with what it negates.
- **Key-word coverage at the default is 79%, not 100%.** The misses are terms that appear
  once in a short text ("black stools", "stomach ulcers", "sublet", "deposit"). The engine
  ranks by statistics and a term used once has little to distinguish it. Raising the
  amount to 30% recovers most of them.
- **The meaning-word misses** are a contrast or quantifier in a sentence with no other
  mark ("However, … few participants"), which the rules leave alone, and "only when"
  where the word it limits was not selected.
- **Underlining is heavy on these texts** (24–34% of words at the default, against 11% on
  the sample article), because they were written to be full of negations and conditions.
- At 10% the marker share comes out at 10–14%, because whole phrases and the
  one-highlight-per-paragraph guarantee are honoured over the exact budget.

## What this evaluation does not show

- **It is a regression set, not an independent benchmark.** The texts and annotations were
  written by the same author as the engine, and the engine was adjusted while looking at
  them. Expect lower scores on unseen text. Independent annotators and a larger, held-out
  set are the first item on the [roadmap](ROADMAP.md).
- **A clean audit is not proof of preserved meaning.** It proves the absence of the listed
  patterns. It does not understand language, so it will not notice sarcasm, a negation
  that reaches further than four words, double negatives, or a sentence whose point is in
  a word the engine did not select.
- **English only.** The negation, contrast and qualifier lists are English.
- **No human reading data.** Whether readers understand a text as well from the marks as
  from a full read is unmeasured; that is the Phase 4 study.
