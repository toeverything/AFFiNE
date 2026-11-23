type BufferConstructorLike = {
  from(
    data: Uint8Array | string,
    encoding?: string
  ): Uint8Array & {
    toString(encoding: string): string;
  };
};

const BufferCtor = (globalThis as { Buffer?: BufferConstructorLike }).Buffer;
const CHUNK_SIZE = 0x8000;

export async function uint8ArrayToBase64(array: Uint8Array): Promise<string> {
  if (BufferCtor) {
    return BufferCtor.from(array).toString('base64');
  }

  let binary = '';
  for (let i = 0; i < array.length; i += CHUNK_SIZE) {
    const chunk = array.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string) {
  if (BufferCtor) {
    return new Uint8Array(BufferCtor.from(base64, 'base64'));
  }

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
