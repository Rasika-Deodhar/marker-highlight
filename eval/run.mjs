// `npm run eval`: scores the engine on the fixture set and exits non-zero on any regression.
import { analyze } from '../src/core/analyze.js';
import { audit, coverage } from '../src/core/audit.js';
import { SAMPLE } from '../app/sample.js';
import { FIXTURES } from './fixtures.js';

// Floors set just under the measured results (see docs/EVALUATION.md) to catch regressions.
// They apply at 20% density and above; the audit must be clean at every density.
export const MIN_KEY_RECALL = 0.75;
export const MIN_MEANING_RECALL = 0.9;
export const DENSITIES = [0.1, 0.2, 0.3];

const sample = {
  name: 'app sample',
  blocks: SAMPLE.split(/\n\s*\n/).map((t) => (t.startsWith('#') ? { text: t.replace(/^#+\s*/, ''), kind: 'heading' } : t)),
  mustCover: [],
  mustKeep: ['do not read', 'not laziness', 'no trick', 'without losing', 'did not improve', 'only 16 percent', 'unaided skimming', 'nothing stands'],
};

export function evaluate(density) {
  return [...FIXTURES, sample].map((f) => {
    const result = analyze(f.blocks, { density });
    const { words, highlighted, context } = result.stats;
    return {
      name: f.name,
      marker: highlighted / words,
      underline: context / words,
      key: coverage(f.blocks, result, f.mustCover),
      keep: coverage(f.blocks, result, f.mustKeep, { anyTier: true }),
      problems: audit(f.blocks, result),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pct = (v) => `${Math.round(v * 100)}%`.padStart(4);
  let failed = false;
  for (const density of DENSITIES) {
    const rows = evaluate(density);
    console.log(`\nRequested density ${pct(density).trim()}`);
    console.log('text                    marker  underline  key words  meaning words  audit');
    for (const r of rows) {
      console.log(
        `${r.name.padEnd(24)}${pct(r.marker)}    ${pct(r.underline)}       ${`${r.key.hit}/${r.key.total}`.padEnd(9)}  ${`${r.keep.hit}/${r.keep.total}`.padEnd(13)}  ${r.problems.length ? `${r.problems.length} PROBLEMS` : 'clean'}`,
      );
      for (const m of r.key.missed) console.log(`    key word not highlighted: "${m}"`);
      for (const m of r.keep.missed) console.log(`    meaning word not marked:  "${m}"`);
      for (const p of r.problems) console.log(`    ${p.rule}: "${p.word}" in "${p.sentence}"`);
    }
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    const recall = sum((r) => r.key.hit) / sum((r) => r.key.total);
    const kept = sum((r) => r.keep.hit) / sum((r) => r.keep.total);
    const problems = sum((r) => r.problems.length);
    console.log(`TOTAL  key words ${pct(recall).trim()}  meaning words ${pct(kept).trim()}  audit problems ${problems}`);
    if (problems || (density >= 0.2 && (recall < MIN_KEY_RECALL || kept < MIN_MEANING_RECALL))) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
