// Turns the positioned text runs of a PDF into readable text: lines -> paragraphs and
// headings, with running headers, footers and page numbers removed. No DOM and no pdf.js
// here, so it is testable in Node.
//
// A PDF stores where each run of glyphs is drawn, not what a paragraph or a heading is, so
// structure is inferred from geometry: the gap between lines, and font size against the
// document's body size.

/**
 * @typedef {{str: string, x: number, y: number, size: number, width?: number, hasEOL?: boolean}} Run
 *   One text run. `y` is the baseline measured from the bottom of the page (PDF convention).
 * @param {Run[][]} pages  runs for each page, in reading order
 * @returns {string} blocks separated by blank lines; headings start with "# " or "## "
 */
export function layoutToText(pages) {
  const pageLines = stripRepeated(pages.map(toLines));
  const all = pageLines.flat();
  if (!all.length) return '';
  const body = bodySize(all);

  const blocks = [];
  const spacing = typicalSpacing(pageLines, body);
  const levels = headingSizes(all, body);
  for (const lines of pageLines) {
    let block = null;
    let prev = null;
    for (const line of lines) {
      const heading = isHeadingLine(line, body) ? levels.get(Math.round(line.size)) : 0;
      const gap = prev ? prev.y - line.y : 0;
      const sameBlock =
        block &&
        prev &&
        block.heading === heading &&
        Math.abs(line.size - prev.size) < 0.6 &&
        gap > 0 && // a jump back up the page is a new column
        gap < spacing * 1.45 * Math.max(1, line.size / body) &&
        !(heading === 0 && isIndented(line, prev, lines) && endsSentence(prev.text));
      if (sameBlock) {
        block.text = joinLines(block.text, line.text);
      } else {
        block = { heading, text: line.text };
        blocks.push(block);
      }
      prev = line;
    }
    if (block) block.pageEnd = true;
  }

  // A paragraph cut by a page break continues on the next page.
  const merged = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last && last.pageEnd && !last.heading && !block.heading && !endsSentence(last.text) && /^[\p{Ll}(]/u.test(block.text)) {
      last.text = joinLines(last.text, block.text);
      last.pageEnd = block.pageEnd;
    } else {
      merged.push({ ...block });
    }
  }
  return merged.map((b) => (b.heading ? '#'.repeat(b.heading) + ' ' : '') + b.text.replace(/^#+\s/, '')).join('\n\n');
}

function toLines(runs) {
  const lines = [];
  let line = null;
  let lastRun = null;
  for (const run of runs) {
    if (!run.str && !run.hasEOL) continue;
    const size = run.size || line?.size || 10;
    const sameLine = line && !line.closed && Math.abs(run.y - line.y) <= Math.max(line.size, size) * 0.45;
    if (!sameLine) {
      line = { text: '', x: run.x, y: run.y, size: 0, chars: 0, closed: false };
      lines.push(line);
      lastRun = null;
    }
    if (run.str) {
      // Runs do not always carry their own spaces: add one when there is a visible gap.
      if (lastRun && lastRun.width != null) {
        const gap = run.x - (lastRun.x + lastRun.width);
        if (gap > size * 0.18 && !/\s$/.test(line.text) && !/^\s/.test(run.str)) line.text += ' ';
      }
      line.text += run.str;
      if (run.str.trim()) {
        // The line's size is that of most of its characters, so a superscript does not skew it.
        if (run.str.length > line.chars || !line.size) {
          line.size = size;
          line.chars = run.str.length;
        }
        lastRun = run;
      }
    }
    if (run.hasEOL) line.closed = true;
  }
  return lines
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text);
}

/** Drop running headers/footers (the same line on most pages) and bare page numbers. */
function stripRepeated(pageLines) {
  const key = (text) => text.replace(/\d+/g, '#').toLowerCase();
  const counts = new Map();
  for (const lines of pageLines) {
    for (const k of new Set(edges(lines).map((l) => key(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pageLines.length * 0.5));
  return pageLines.map((lines) => {
    const edge = new Set(edges(lines));
    return lines.filter((l) => {
      if (!edge.has(l)) return true;
      if (/^(page\s+)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(l.text) || /^[-–—]\s*\d{1,4}\s*[-–—]$/.test(l.text)) return false;
      return counts.get(key(l.text)) < threshold;
    });
  });
}

/** The two highest and two lowest lines on a page: where headers and footers live. */
function edges(lines) {
  if (lines.length <= 4) return lines;
  const byY = [...lines].sort((a, b) => b.y - a.y);
  return [...byY.slice(0, 2), ...byY.slice(-2)];
}

/** Body text size: the size most characters are set in. */
function bodySize(lines) {
  const weight = new Map();
  for (const l of lines) {
    const s = Math.round(l.size * 2) / 2;
    weight.set(s, (weight.get(s) ?? 0) + l.text.length);
  }
  return [...weight].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Distance between baselines inside a paragraph of body text. Taken from the whole document
 * and from the low end of the gaps, so a page with few lines or many headings does not
 * mistake paragraph gaps for line spacing.
 */
function typicalSpacing(pageLines, body) {
  const gaps = [];
  for (const lines of pageLines) {
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y;
      const bodyText = Math.abs(lines[i].size - body) < 0.6 && Math.abs(lines[i - 1].size - body) < 0.6;
      if (bodyText && gap > body * 0.6 && gap < body * 3) gaps.push(gap);
    }
  }
  if (!gaps.length) return body * 1.2;
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length * 0.3)];
}

/**
 * Sizes that count as headings, mapped to a level. With several heading sizes the largest
 * is the title (1) and the rest are sections (2); with one, it is a title only if it is
 * much larger than the body.
 */
function headingSizes(lines, body) {
  const sizes = [...new Set(lines.filter((l) => isHeadingLine(l, body)).map((l) => Math.round(l.size)))].sort((a, b) => b - a);
  return new Map(sizes.map((size, i) => [size, sizes.length > 1 ? (i === 0 ? 1 : 2) : size >= body * 1.45 ? 1 : 2]));
}

function isHeadingLine(line, body) {
  return line.size >= body * 1.12 && line.text.length <= 140 && /\p{L}/u.test(line.text);
}

function isIndented(line, prev, lines) {
  const left = Math.min(...lines.map((l) => l.x));
  return line.x - left > line.size * 0.8 && prev.x - left < line.size * 0.4;
}

function endsSentence(text) {
  return /[.!?:]["'”’)\]]*$/.test(text);
}

function joinLines(a, b) {
  // "exam-" + "ple": a lowercase word split across lines is rejoined; "well-" + "Known" is not.
  if (/\p{Ll}-$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}
