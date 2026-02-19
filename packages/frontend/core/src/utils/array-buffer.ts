/**
 * Convert binary data to a strict ArrayBuffer for DOM APIs whose types
 * require ArrayBuffer-backed views (not ArrayBufferLike).
 */
export function toArrayBuffer(
  data: ArrayBuffer | ArrayBufferLike | ArrayBufferView
): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    if (data.buffer instanceof ArrayBuffer) {
      if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
        return data.buffer;
      }
      return data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      );
    }

    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }

  const bytes = new Uint8Array(data);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
