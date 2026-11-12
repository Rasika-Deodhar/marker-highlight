// `node eval/show.mjs [density]`: prints each fixture with [[marker]] and __underline__ marks.
import { analyze } from '../src/core/analyze.js';
import { FIXTURES } from './fixtures.js';

const density = Number(process.argv[2]) || 0.2;
for (const f of FIXTURES) {
  const result = analyze(f.blocks, { density });
  console.log(`\n== ${f.name}`);
  f.blocks.forEach((raw, b) => {
    const text = typeof raw === 'string' ? raw : raw.text;
    const marks = [
      ...result.blocks[b].ranges.map(([s, e]) => [s, e, '[[', ']]']),
      ...result.blocks[b].context.map(([s, e]) => [s, e, '__', '__']),
    ].sort((x, y) => y[0] - x[0]);
    let out = text;
    for (const [s, e, open, close] of marks) out = out.slice(0, s) + open + out.slice(s, e) + close + out.slice(e);
    console.log(out);
  });
}
