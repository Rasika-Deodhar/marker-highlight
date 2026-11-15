// Minimal zip reader for .docx and .epub, built on the platform's DecompressionStream.
// Reads the central directory, then inflates single entries on demand.

/**
 * @param {Uint8Array} bytes
 * @returns {{names: string[], text(name: string): Promise<string|null>}}
 */
export function openZip(bytes) {
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
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Corrupt zip archive');
    const nameLength = view.getUint16(at + 28, true);
    entries.set(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)), {
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      localOffset: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return {
    names: [...entries.keys()],
    /** One entry as UTF-8 text, or null if it is not in the archive. */
    async text(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      const { localOffset } = entry;
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const body = bytes.subarray(start, start + entry.compressedSize);
      if (entry.method === 0) return decoder.decode(body);
      if (entry.method !== 8) throw new Error('Unsupported zip compression');
      const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    },
  };
}

/** Read one file out of a zip archive as UTF-8 text, or null if it is not there. */
export async function unzipEntry(bytes, name) {
  return openZip(bytes).text(name);
}
