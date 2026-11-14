// HTML file -> text. Parsed with DOMParser, which builds an inert document: scripts do not
// run and nothing is fetched. Only text is taken from it, never markup.

const DROP = 'script,style,noscript,template,nav,header,footer,aside,form,iframe,svg,figure,button,[hidden],[aria-hidden="true"]';
const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,dd,dt,td,th';

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
  if (!root) return '';
  for (const el of root.querySelectorAll(DROP)) el.remove();
  for (const br of root.querySelectorAll('br')) br.replaceWith(' ');

  const blocks = [];
  // Innermost blocks only, so "<li><p>text</p></li>" is read once.
  for (const el of root.querySelectorAll(BLOCKS)) {
    if (el.querySelector(BLOCKS)) continue;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const level = /^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : 0;
    blocks.push((level ? '#'.repeat(level) + ' ' : '') + text.replace(/^#+\s/, ''));
  }
  if (blocks.length) return blocks.join('\n\n');
  return (root.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n\n').trim();
}
