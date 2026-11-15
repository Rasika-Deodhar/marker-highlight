// EPUB -> text. An EPUB is a zip: META-INF/container.xml names the package file (.opf),
// whose manifest lists the files and whose spine gives the reading order of the chapters,
// each an XHTML document.

import { openZip } from './zip.js';

/**
 * @param {ArrayBuffer} data
 * @param {(html: string) => string} chapterToText  XHTML -> text (needs a DOM, so injected)
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function epubToText(data, chapterToText, onProgress) {
  let zip;
  let paths;
  try {
    zip = openZip(new Uint8Array(data));
    const container = await zip.text('META-INF/container.xml');
    const opfPath = attr(container?.match(/<rootfile\b[^>]*>/)?.[0] ?? '', 'full-path');
    paths = readingOrder(await zip.text(opfPath), opfPath);
  } catch {
    paths = null;
  }
  if (!paths?.length) throw new Error('This file could not be read as an EPUB book.');

  const parts = [];
  for (let i = 0; i < paths.length; i++) {
    const xhtml = await zip.text(paths[i]).catch(() => null);
    if (xhtml) {
      const text = chapterToText(xhtml).trim();
      if (text) parts.push(text);
    }
    onProgress?.(i + 1, paths.length);
  }
  if (!parts.length && zip.names.includes('META-INF/encryption.xml')) {
    throw new Error('This EPUB is copy-protected (DRM), so its text cannot be read.');
  }
  return parts.join('\n\n');
}

/** Chapter paths inside the archive, in reading order. Exported for tests. */
export function readingOrder(opf, opfPath) {
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = new Map();
  for (const [tag] of opf.matchAll(/<(?:\w+:)?item\b[^>]*>/g)) {
    const type = attr(tag, 'media-type');
    const isNav = /(^|\s)nav(\s|$)/.test(attr(tag, 'properties'));
    if (/x?html/.test(type) && !isNav) manifest.set(attr(tag, 'id'), attr(tag, 'href'));
  }
  const paths = [];
  for (const [tag] of opf.matchAll(/<(?:\w+:)?itemref\b[^>]*>/g)) {
    const href = manifest.get(attr(tag, 'idref'));
    if (href && attr(tag, 'linear') !== 'no') paths.push(resolve(base, href));
  }
  return paths;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return (m?.[1] ?? m?.[2] ?? '').replace(/&amp;/g, '&');
}

/** Resolve a manifest href against the package file's folder; hrefs are URL-encoded. */
function resolve(base, href) {
  const out = [];
  for (const part of (base + href.split('#')[0]).split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  try {
    return decodeURIComponent(out.join('/'));
  } catch {
    return out.join('/');
  }
}
