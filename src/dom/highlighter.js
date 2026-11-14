// DOM adapter: reads text out of a subtree, asks the core engine what matters, and paints
// the answer with the CSS Custom Highlight API.
//
// Painting never mutates the page's DOM (no wrapper elements), so turning it off is exact
// and it cannot break a host page's own scripts or layout. That property matters most once
// this runs as an extension content script on pages we do not control.

import { analyze } from '../core/analyze.js';

export const HIGHLIGHT_NAME = 'marker-highlight'; // tier 1: the important words
export const CONTEXT_NAME = 'marker-highlight-context'; // tier 2: words that keep them truthful

const SKIP = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'CODE', 'PRE', 'KBD', 'SAMP', 'TEXTAREA', 'INPUT',
  'SELECT', 'OPTION', 'BUTTON', 'NAV', 'SVG', 'MATH', 'IFRAME', 'CANVAS', 'AUDIO', 'VIDEO',
]);
const INLINE = new Set([
  'A', 'ABBR', 'B', 'BDI', 'BDO', 'CITE', 'DATA', 'DEL', 'DFN', 'EM', 'FONT', 'I', 'INS', 'LABEL',
  'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR',
]);

export function isSupported() {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
}

/**
 * Group the text nodes under `root` into paragraph-level blocks.
 * Each block keeps a map from its text offsets back to the DOM nodes they came from.
 */
export function collectBlocks(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      const skip =
        SKIP.has(node.tagName.toUpperCase()) ||
        node.hidden ||
        node.isContentEditable ||
        node.getAttribute('aria-hidden') === 'true';
      return skip ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });

  const blocks = [];
  let current = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // A <br> separates words visually; keep that separation in the extracted text.
      if (node.tagName === 'BR' && current) current.text += '\n';
      continue;
    }
    const el = blockAncestor(node, root);
    if (!current || current.el !== el) {
      current = { el, kind: el.closest('h1,h2,h3,h4,h5,h6') ? 'heading' : 'body', text: '', segments: [] };
      blocks.push(current);
    }
    current.segments.push({ node, start: current.text.length });
    current.text += node.data;
  }
  return blocks.filter((b) => /[\p{L}\p{N}]/u.test(b.text));
}

function blockAncestor(node, root) {
  let el = node.parentElement;
  while (el !== root && INLINE.has(el.tagName)) el = el.parentElement;
  return el;
}

/** Convert a [start, end) text range of a block into a DOM Range. */
function toDomRange(block, start, end) {
  const range = block.el.ownerDocument.createRange();
  const a = segmentAt(block, start);
  const b = segmentAt(block, end - 1);
  range.setStart(a.node, start - a.start);
  range.setEnd(b.node, end - b.start);
  return range;
}

function segmentAt(block, offset) {
  const segs = block.segments;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return segs[lo];
}

/**
 * @param {Element} root  The subtree to read and highlight.
 */
export function createHighlighter(root) {
  return {
    /** Analyse the subtree and paint highlights. Returns the engine's stats. */
    apply(options) {
      const blocks = collectBlocks(root);
      const result = analyze(blocks, options);
      const highlight = new Highlight();
      const context = new Highlight();
      result.blocks.forEach((marks, i) => {
        for (const [start, end] of marks.ranges) highlight.add(toDomRange(blocks[i], start, end));
        for (const [start, end] of marks.context) context.add(toDomRange(blocks[i], start, end));
      });
      CSS.highlights.set(HIGHLIGHT_NAME, highlight);
      CSS.highlights.set(CONTEXT_NAME, context);
      return result;
    },
    clear() {
      CSS.highlights.delete(HIGHLIGHT_NAME);
      CSS.highlights.delete(CONTEXT_NAME);
    },
  };
}
