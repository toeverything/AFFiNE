const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readNullTerminated(
  buffer: Uint8Array,
  start: number
): { value: string; next: number } {
  let end = start;
  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }
  const value = new TextDecoder('utf-8').decode(buffer.slice(start, end));
  return { value, next: end + 1 };
}

function isPng(buffer: ArrayBuffer) {
  const header = new Uint8Array(buffer, 0, PNG_SIGNATURE.length);
  return PNG_SIGNATURE.every((byte, index) => header[index] === byte);
}

export function extractPngMetadata(
  buffer: ArrayBuffer,
  keyword: string
): string | null {
  if (!isPng(buffer)) return null;
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = PNG_SIGNATURE.length;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder('ascii').decode(
      bytes.slice(offset + 4, offset + 8)
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > bytes.length) break;

    if (type === 'iTXt') {
      const chunk = bytes.slice(dataStart, dataEnd);
      const first = readNullTerminated(chunk, 0);
      if (first.value === keyword) {
        const compressionFlag = chunk[first.next];
        const compressionMethod = chunk[first.next + 1];
        if (compressionFlag === 0 && compressionMethod === 0) {
          const language = readNullTerminated(chunk, first.next + 2);
          const translated = readNullTerminated(chunk, language.next);
          const textBytes = chunk.slice(translated.next);
          return new TextDecoder('utf-8').decode(textBytes);
        }
      }
    }

    if (type === 'tEXt') {
      const chunk = bytes.slice(dataStart, dataEnd);
      const first = readNullTerminated(chunk, 0);
      if (first.value === keyword) {
        const textBytes = chunk.slice(first.next);
        return new TextDecoder('utf-8').decode(textBytes);
      }
    }

    if (type === 'IEND') break;
    offset = dataEnd + 4;
  }

  return null;
}

export function embedPngMetadata(
  buffer: ArrayBuffer,
  keyword: string,
  text: string
): Uint8Array {
  if (!isPng(buffer)) {
    return new Uint8Array(buffer);
  }
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const chunks: Uint8Array[] = [];
  chunks.push(bytes.slice(0, PNG_SIGNATURE.length));

  const keywordBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);
  const itxtData = new Uint8Array(
    keywordBytes.length + 1 + 2 + 1 + 1 + textBytes.length
  );
  let cursor = 0;
  itxtData.set(keywordBytes, cursor);
  cursor += keywordBytes.length;
  itxtData[cursor] = 0;
  cursor += 1;
  itxtData[cursor] = 0;
  itxtData[cursor + 1] = 0;
  cursor += 2;
  itxtData[cursor] = 0;
  cursor += 1;
  itxtData[cursor] = 0;
  cursor += 1;
  itxtData.set(textBytes, cursor);

  let offset = PNG_SIGNATURE.length;
  let inserted = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = bytes.slice(offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > bytes.length) break;

    const typeString = new TextDecoder('ascii').decode(type);
    if (!inserted && typeString === 'IEND') {
      const itxtChunk = buildChunk('iTXt', itxtData);
      chunks.push(itxtChunk);
      inserted = true;
    }
    chunks.push(bytes.slice(offset, chunkEnd));
    offset = chunkEnd;
  }

  if (!inserted) {
    chunks.push(buildChunk('iTXt', itxtData));
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let resultOffset = 0;
  for (const chunk of chunks) {
    result.set(chunk, resultOffset);
    resultOffset += chunk.length;
  }
  return result;
}

function buildChunk(type: string, data: Uint8Array) {
  const lengthBytes = new Uint8Array(4);
  const view = new DataView(lengthBytes.buffer);
  view.setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const crcValue = crc32(crcInput);
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crcValue);

  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  chunk.set(lengthBytes, 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunk.set(crcBytes, 8 + data.length);
  return chunk;
}
