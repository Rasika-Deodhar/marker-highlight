import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';

import { detectFormat } from '../src/import/index.js';
import { markdownToText } from '../src/import/markdown.js';
import { layoutToText } from '../src/import/pdf-layout.js';
import { documentXmlToText, docxToText } from '../src/import/docx.js';
import { epubToText, readingOrder } from '../src/import/epub.js';
import { unzipEntry } from '../src/import/zip.js';

test('detectFormat: by extension first, then MIME type', () => {
  assert.equal(detectFormat('Report.PDF', ''), 'pdf');
  assert.equal(detectFormat('notes.md', 'text/plain'), 'markdown');
  assert.equal(detectFormat('page.htm', ''), 'html');
  assert.equal(detectFormat('essay.docx', ''), 'docx');
  assert.equal(detectFormat('novel.epub', ''), 'epub');
  assert.equal(detectFormat('book', 'application/epub+zip'), 'epub');
  assert.equal(detectFormat('download', 'application/pdf'), 'pdf');
  assert.equal(detectFormat('data.csv', 'text/csv'), 'text');
  assert.equal(detectFormat('README', ''), 'text');
  assert.equal(detectFormat('old.doc', 'application/msword'), null);
  assert.equal(detectFormat('photo.png', 'image/png'), null);
});

test('markdownToText: strips syntax, keeps headings and separates blocks', () => {
  const text = markdownToText(
    [
      '---', 'title: x', '---',
      '# The **Title**',
      'Intro with a [link](https://example.com) and `code`,',
      'continued on a second line.',
      '## Section',
      '- first *item*',
      '- [x] second item',
      '1. numbered',
      '> quoted _text_',
      '',
      'Setext',
      '------',
      'snake_case_name stays, 2 * 3 * 4 stays.',
    ].join('\n'),
  );
  assert.deepEqual(text.split('\n\n'), [
    '# The Title',
    'Intro with a link and code,\ncontinued on a second line.',
    '## Section',
    'first item',
    'second item',
    'numbered\nquoted text',
    '## Setext',
    'snake_case_name stays, 2 * 3 * 4 stays.',
  ]);
});

/** Build one page of runs from [text, size] lines laid out top to bottom. */
function page(lines, { top = 760, left = 72 } = {}) {
  let y = top;
  return lines.map(([str, size = 10, opts = {}]) => {
    y -= opts.gap ?? size * 1.2;
    return { str, x: opts.x ?? left, y, size, width: str.length * size * 0.5, hasEOL: true };
  });
}

test('layoutToText: paragraphs from line gaps, headings from font size, hyphenation rejoined', () => {
  const text = layoutToText([
    page([
      ['A Study of Skimming', 20],
      ['Readers rarely read every word on a page. They scan for mean-', 10, { gap: 30 }],
      ['ingful phrases and skip the rest.', 10],
      ['A second paragraph starts after a wider gap.', 10, { gap: 24 }],
      ['Method', 13, { gap: 28 }],
      ['Forty well-', 10, { gap: 20 }],
      ['Known readers took part.', 10],
    ]),
  ]);
  assert.deepEqual(text.split('\n\n'), [
    '# A Study of Skimming',
    'Readers rarely read every word on a page. They scan for meaningful phrases and skip the rest.',
    'A second paragraph starts after a wider gap.',
    '## Method',
    'Forty well- Known readers took part.',
  ]);
});

test('layoutToText: drops running headers, footers and page numbers; joins across pages', () => {
  const body = (first, last) => [
    ['Journal of Reading, Vol. 12', 8],
    [first, 10, { gap: 40 }],
    ['which is the middle line of this page of body text', 10],
    [last, 10],
  ];
  const withFooter = (lines, n) => [...page(lines), { str: String(n), x: 300, y: 40, size: 8, width: 5, hasEOL: true }];
  const text = layoutToText([
    withFooter(body('The first page begins a long sentence', 'and it does not finish before the page'), 1),
    withFooter(body('ends, so it carries on here.', 'A new sentence closes the page.'), 2),
    withFooter(body('Page three starts a fresh paragraph.', 'It ends cleanly.'), 3),
  ]);
  assert.ok(!/Journal of Reading/.test(text), text);
  assert.ok(!/^\d$/m.test(text), text);
  const blocks = text.split('\n\n');
  assert.equal(blocks.length, 2, text);
  assert.match(blocks[0], /before the page ends, so it carries on here\./);
  assert.match(blocks[1], /^Page three starts/);
});

test('layoutToText: runs on one line are joined, with a space only across a visible gap', () => {
  const text = layoutToText([
    [
      { str: 'High', x: 72, y: 700, size: 10, width: 20 },
      { str: 'light', x: 92, y: 700, size: 10, width: 20 },
      { str: 'words', x: 118, y: 700, size: 10, width: 25, hasEOL: true },
    ],
  ]);
  assert.equal(text, 'Highlight words');
  assert.equal(layoutToText([[]]), '');
});

test('documentXmlToText: headings from styles, entities decoded, deletions dropped', () => {
  const xml = `<w:document><w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Annual Report</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Results</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Revenue &amp; profit </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>rose</w:t></w:r><w:del><w:r><w:delText>fell</w:delText></w:r></w:del><w:r><w:tab/><w:t>10&#37;.</w:t></w:r></w:p>
    <w:p/>
  </w:body></w:document>`;
  assert.equal(documentXmlToText(xml), '# Annual Report\n\n## Results\n\nRevenue & profit rose 10%.');
});

/** Minimal zip writer, enough to produce a .docx for the reader to open. */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content, method = 8] of files) {
    const raw = Buffer.from(content);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    chunks.push(local, nameBytes, data);
    offset += 30 + nameBytes.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, dir, end]));
}

test('docxToText: reads word/document.xml out of the archive', async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>Hello from Word.</w:t></w:r></w:p></w:body></w:document>';
  const bytes = zip([
    ['[Content_Types].xml', '<Types/>', 0],
    ['word/document.xml', xml],
  ]);
  assert.equal(await docxToText(bytes.buffer), 'Hello from Word.');
  assert.equal(await unzipEntry(bytes, '[Content_Types].xml'), '<Types/>');
  assert.equal(await unzipEntry(bytes, 'missing.xml'), null);
  await assert.rejects(docxToText(new TextEncoder().encode('not a zip at all, just some text').buffer), /Word document/);
  await assert.rejects(docxToText(zip([['other.xml', '<x/>']]).buffer), /Word document/);
});

const OPF = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="c2" href="text/ch%202.xhtml" media-type="application/xhtml+xml"/>
  <item id="c1" href='text/ch1.xhtml' media-type="application/xhtml+xml"/>
  <item id="notes" href="../notes.xhtml" media-type="application/xhtml+xml"/>
  <item id="css" href="style.css" media-type="text/css"/>
  <item id="cover" href="cover.jpg" media-type="image/jpeg"/>
</manifest><spine>
  <itemref idref="cover"/><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/>
  <itemref idref="notes" linear="no"/>
</spine></package>`;

test('readingOrder: spine order, resolved against the package folder; nav and non-linear items skipped', () => {
  assert.deepEqual(readingOrder(OPF, 'OEBPS/content.opf'), ['OEBPS/text/ch1.xhtml', 'OEBPS/text/ch 2.xhtml']);
  assert.deepEqual(readingOrder(OPF, 'content.opf'), ['text/ch1.xhtml', 'text/ch 2.xhtml']);
});

test('epubToText: reads the chapters in spine order', async () => {
  const container = '<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
  const book = zip([
    ['mimetype', 'application/epub+zip', 0],
    ['META-INF/container.xml', container],
    ['OEBPS/content.opf', OPF],
    ['OEBPS/text/ch 2.xhtml', '<p>Second.</p>'],
    ['OEBPS/text/ch1.xhtml', '<p>First.</p>'],
    ['OEBPS/nav.xhtml', '<p>Contents</p>'],
  ]);
  const stripTags = (xhtml) => xhtml.replace(/<[^>]+>/g, '');
  const progress = [];
  assert.equal(await epubToText(book.buffer, stripTags, (n, total) => progress.push(`${n}/${total}`)), 'First.\n\nSecond.');
  assert.deepEqual(progress, ['1/2', '2/2']);
  await assert.rejects(epubToText(zip([['other.txt', 'x']]).buffer, stripTags), /EPUB/);
  await assert.rejects(epubToText(new Uint8Array(40).buffer, stripTags), /EPUB/);
  const locked = zip([
    ['META-INF/container.xml', container],
    ['META-INF/encryption.xml', '<encryption/>'],
    ['OEBPS/content.opf', OPF],
    ['OEBPS/text/ch1.xhtml', ''],
  ]);
  await assert.rejects(epubToText(locked.buffer, stripTags), /copy-protected/);
});
