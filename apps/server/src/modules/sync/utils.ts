export const base64ToUint8Array = (base64: string): Uint8Array => {
  const buffer: ArrayBuffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer);
};

export const uint8ArrayToBase64 = (uint8Array: Uint8Array): string => {
  return Buffer.from(uint8Array).toString('base64');
};

export type DocUpdate = {
  guid: string;
  update: Uint8Array;
};

export function assertExists<T>(
  val: T | null | undefined,
  message: string | Error = 'val does not exist'
): asserts val is T {
  if (val === null || val === undefined) {
    if (message instanceof Error) {
      throw message;
    }
    throw new Error(message);
  }
}
