// HTML file -> text. Parsed with DOMParser, which builds an inert document: scripts do not
// run and nothing is fetched. Only text is taken from it, never markup.

const DROP = 'script,style,noscript,template,nav,aside,form,iframe,svg,figure,button,[hidden],[aria-hidden="true"]';
const PAGE_CHROME = 'header,footer'; // site banners on a web page; chapter headings in a book
const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,dd,dt,td,th';

/**
 * @param {string} html
 * @param {{xhtml?: boolean}} [options]  `xhtml` for EPUB chapters: parsed as XML first
 *   (in XHTML "<title/>" is complete, while an HTML parser would swallow the page into it),
 *   and <header>/<footer> are kept.
 */
export function htmlToText(html, { xhtml = false } = {}) {
  let doc = xhtml ? new DOMParser().parseFromString(html, 'application/xhtml+xml') : null;
  if (!doc || doc.querySelector('parsererror')) doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.querySelector('body');
  if (!root) return '';
  for (const el of root.querySelectorAll(xhtml ? DROP : `${DROP},${PAGE_CHROME}`)) el.remove();
  for (const br of root.querySelectorAll('br')) br.replaceWith(' ');

  const blocks = [];
  // Innermost blocks only, so "<li><p>text</p></li>" is read once.
  for (const el of root.querySelectorAll(BLOCKS)) {
    if (el.querySelector(BLOCKS)) continue;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const level = /^h[1-6]$/i.test(el.localName) ? Number(el.localName[1]) : 0;
    blocks.push((level ? '#'.repeat(level) + ' ' : '') + text.replace(/^#+\s/, ''));
  }
  if (blocks.length) return blocks.join('\n\n');
  return (root.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n\n').trim();
}
