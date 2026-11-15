// File import: turns a file the user picked into the app's plain-text convention (blocks
// separated by blank lines, headings marked with leading #). Everything happens in the tab.

import { markdownToText } from './markdown.js';

export const ACCEPT = '.pdf,.epub,.docx,.txt,.text,.md,.markdown,.html,.htm,application/pdf,application/epub+zip,text/plain,text/markdown,text/html';
export const FORMATS_LABEL = 'PDF, EPUB, Word (.docx), Markdown, HTML or plain text';

const BY_EXTENSION = {
  pdf: 'pdf', epub: 'epub', docx: 'docx', md: 'markdown', markdown: 'markdown', mdown: 'markdown',
  html: 'html', htm: 'html', xhtml: 'html', txt: 'text', text: 'text', log: 'text',
};
const BY_TYPE = {
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/markdown': 'markdown',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
};

/** @returns {'pdf'|'epub'|'docx'|'markdown'|'html'|'text'|null} */
export function detectFormat(name = '', type = '') {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const mime = type.split(';')[0].trim().toLowerCase();
  if (BY_EXTENSION[ext]) return BY_EXTENSION[ext];
  if (BY_TYPE[mime]) return BY_TYPE[mime];
  if (mime.startsWith('text/')) return 'text';
  if (ext === 'doc') return null; // the old binary Word format
  return mime ? null : 'text'; // no extension and no type: try it as text
}

/**
 * @param {File} file
 * @param {(message: string) => void} [onProgress]
 * @returns {Promise<{text: string, format: string, structured: boolean}>}
 *   `structured` is true when headings came from the file itself, so the caller should not
 *   guess at them.
 */
export async function importFile(file, onProgress) {
  const format = detectFormat(file.name, file.type);
  let text;
  switch (format) {
    case 'pdf': {
      onProgress?.('Opening PDF…');
      const { pdfToText } = await import('./pdf.js');
      text = await pdfToText(await file.arrayBuffer(), (n, total) => onProgress?.(`Reading page ${n} of ${total}…`));
      break;
    }
    case 'epub': {
      onProgress?.('Opening book…');
      const [{ epubToText }, { htmlToText }] = await Promise.all([import('./epub.js'), import('./html.js')]);
      text = await epubToText(
        await file.arrayBuffer(),
        (xhtml) => htmlToText(xhtml, { xhtml: true }),
        (n, total) => onProgress?.(`Reading chapter ${n} of ${total}…`),
      );
      break;
    }
    case 'docx': {
      const { docxToText } = await import('./docx.js');
      text = await docxToText(await file.arrayBuffer());
      break;
    }
    case 'html': {
      const { htmlToText } = await import('./html.js');
      text = htmlToText(await file.text());
      break;
    }
    case 'markdown':
      text = markdownToText(await file.text());
      break;
    case 'text':
      text = await file.text();
      if (text.slice(0, 2000).includes('\u0000')) throw new Error(`"${file.name}" does not look like a text file.`);
      break;
    default:
      throw new Error(
        /\.doc$/i.test(file.name)
          ? 'Old .doc files are not supported. Save it as .docx or PDF and try again.'
          : `"${file.name}" is not a supported format. Open a ${FORMATS_LABEL} file.`,
      );
  }
  if (!text.trim()) throw new Error(`No text was found in "${file.name}".`);
  return { text, format, structured: format !== 'text' };
}
