// Word (.docx) -> text. A .docx is a zip of XML files; the body is word/document.xml.
// Read with the platform's DecompressionStream (see zip.js), so there is no library to ship.

import { unzipEntry } from './zip.js';

export async function docxToText(data) {
  let xml;
  try {
    xml = await unzipEntry(new Uint8Array(data), 'word/document.xml');
  } catch {
    xml = null;
  }
  if (xml == null) throw new Error('This file could not be read as a Word document (.docx).');
  return documentXmlToText(xml);
}

export function documentXmlToText(xml) {
  const blocks = [];
  for (const [, , p] of xml.matchAll(/<w:p(\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const text = p
      .replace(/<w:(del|moveFrom)\b[\s\S]*?<\/w:\1>/g, '') // tracked deletions are not part of the text
      .replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, '') // field codes, e.g. PAGEREF
      .replace(/<w:tab\b[^>]*\/>/g, ' ')
      .replace(/<w:(br|cr)\b[^>]*\/>/g, ' ')
      .replace(/<w:noBreakHyphen\b[^>]*\/>/g, '-')
      .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<[^>]+>/g, (_, t) => t ?? '')
      .replace(/&(lt|gt|quot|apos|amp|#x?[0-9a-fA-F]+);/g, entity)
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const style = p.match(/<w:pStyle\s+w:val="([^"]+)"/)?.[1] ?? '';
    const level = /^title$/i.test(style) ? 1 : Number(style.match(/^heading\s*(\d)$/i)?.[1] ?? 0);
    blocks.push((level ? '#'.repeat(Math.min(level, 6)) + ' ' : '') + text.replace(/^#+\s/, ''));
  }
  return blocks.join('\n\n');
}

function entity(_, name) {
  const named = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
  if (name in named) return named[name];
  const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}
