// PDF -> text. Loads the bundled pdf.js the first time a PDF is opened; nothing is fetched
// from another origin and the file never leaves the tab.

import { layoutToText } from './pdf-layout.js';

const LIB = new URL('../../third_party/pdfjs/pdf.min.js', import.meta.url).href;
const WORKER = new URL('../../third_party/pdfjs/pdf.worker.min.js', import.meta.url).href;

let pdfjs;

/**
 * @param {ArrayBuffer} data
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function pdfToText(data, onProgress) {
  if (!pdfjs) {
    pdfjs = await import(LIB);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
  }
  const task = pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false, stopAtErrors: false });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if (err?.name === 'PasswordException') throw new Error('This PDF is password-protected, so its text cannot be read.');
    throw new Error('This file could not be read as a PDF. It may be damaged.');
  }
  try {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter((item) => 'str' in item)
          .map((item) => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
            // Glyph height from the text matrix, which also covers rotated or scaled text.
            size: Math.hypot(item.transform[2], item.transform[3]) || item.height,
            width: item.width,
            hasEOL: item.hasEOL,
          })),
      );
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
    const text = layoutToText(pages);
    if (!text.trim()) {
      throw new Error('This PDF has no selectable text. It is probably a scan, which would need OCR first.');
    }
    return text;
  } finally {
    task.destroy();
  }
}
