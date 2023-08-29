import type { Doc as YDoc } from 'yjs';

export type SubdocEvent = {
  loaded: Set<YDoc>;
  removed: Set<YDoc>;
  added: Set<YDoc>;
};

export type UpdateHandler = (update: Uint8Array, origin: unknown) => void;
export type SubdocsHandler = (event: SubdocEvent) => void;
export type DestroyHandler = () => void;

export type AwarenessChanges = Record<
  'added' | 'updated' | 'removed',
  number[]
>;

export function uint8ArrayToBase64(array: Uint8Array): Promise<string> {
  return new Promise<string>(resolve => {
    // Create a blob from the Uint8Array
    const blob = new Blob([array]);

    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = reader.result as string | null;
      if (!dataUrl) {
        resolve('');
        return;
      }
      // The result includes the `data:` URL prefix and the MIME type. We only want the Base64 data
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };

    reader.readAsDataURL(blob);
  });
}

export function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const binaryArray = binaryString.split('').map(function (char) {
    return char.charCodeAt(0);
  });
  return new Uint8Array(binaryArray);
}
