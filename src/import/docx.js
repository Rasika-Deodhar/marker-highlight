// Word (.docx) -> text. A .docx is a zip of XML files; the body is word/document.xml.
// Uses the platform's DecompressionStream, so there is no zip or XML library to ship.

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

/** Read one file out of a zip archive as UTF-8 text, or null if it is not there. */
export async function unzipEntry(bytes, name) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is at the end, before an optional comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip archive');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Corrupt zip archive');
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const entryName = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (entryName === name) {
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const body = bytes.subarray(start, start + compressedSize);
      if (method === 0) return decoder.decode(body);
      if (method !== 8) throw new Error('Unsupported zip compression');
      const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}
