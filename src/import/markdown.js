// Markdown -> the app's plain-text convention: blocks separated by blank lines, headings
// marked with leading #. Only strips syntax; it does not try to be a full Markdown parser.

export function markdownToText(md) {
  const out = [];
  let inFence = false;
  const lines = md.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push('');
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    // Setext headings: a line of === or --- under a text line.
    const next = lines[i + 1] ?? '';
    if (line.trim() && !/^\s*([#>*+-]|\d+[.)])\s/.test(line) && /^\s*(=+|-{2,})\s*$/.test(next) && !(lines[i - 1] ?? '').trim()) {
      out.push('', `${next.trim().startsWith('=') ? '#' : '##'} ${inline(line.trim())}`, '');
      i++;
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      out.push(''); // horizontal rule
      continue;
    }
    line = line.replace(/^\s*(>\s?)+/, '');
    const heading = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      out.push('', `${heading[1]} ${inline(heading[2])}`, '');
      continue;
    }
    const item = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (item) {
      out.push('', inline(item[1])); // each list item becomes its own block
      continue;
    }
    if (/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line)) continue; // table divider row
    out.push(inline(line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').replace(/\s*\|\s*/g, ' — ')));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function inline(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '$1')
    .replace(/(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!>|])/g, '$1');
}
