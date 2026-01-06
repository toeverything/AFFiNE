import { extMimeMap, getAssetName } from '@blocksuite/store';
import * as fflate from 'fflate';
import { FAILSAFE_SCHEMA, load as loadYaml } from 'js-yaml';

export class Zip {
  private compressed = new Uint8Array();

  private finalize?: () => void;

  private finalized = false;

  private readonly zip = new fflate.Zip((err, chunk, final) => {
    if (!err) {
      const temp = new Uint8Array(this.compressed.length + chunk.length);
      temp.set(this.compressed);
      temp.set(chunk, this.compressed.length);
      this.compressed = temp;
    }
    if (final) {
      this.finalized = true;
      this.finalize?.();
    }
  });

  async file(path: string, content: Blob | File | string) {
    const deflate = new fflate.ZipDeflate(path);
    this.zip.add(deflate);
    if (typeof content === 'string') {
      deflate.push(fflate.strToU8(content), true);
    } else {
      deflate.push(new Uint8Array(await content.arrayBuffer()), true);
    }
  }

  folder(folderPath: string) {
    return {
      folder: (folderPath2: string) => {
        return this.folder(`${folderPath}/${folderPath2}`);
      },
      file: async (name: string, blob: Blob) => {
        await this.file(`${folderPath}/${name}`, blob);
      },
      generate: async () => {
        return this.generate();
      },
    };
  }

  async generate() {
    this.zip.end();
    return new Promise<Blob>(resolve => {
      if (this.finalized) {
        resolve(new Blob([this.compressed], { type: 'application/zip' }));
      } else {
        this.finalize = () =>
          resolve(new Blob([this.compressed], { type: 'application/zip' }));
      }
    });
  }
}

export class Unzip {
  private unzipped?: ReturnType<typeof fflate.unzipSync>;

  async load(blob: Blob) {
    this.unzipped = fflate.unzipSync(new Uint8Array(await blob.arrayBuffer()));
  }

  private fixFileNameEncoding(fileName: string): string {
    try {
      // check if contains non-ASCII characters
      if (fileName.split('').some(char => char.charCodeAt(0) > 127)) {
        // try different encodings
        const fixedName = this.tryDifferentEncodings(fileName);
        if (fixedName && fixedName !== fileName) {
          return fixedName;
        }
      }
      return fileName;
    } catch {
      return fileName;
    }
  }

  // try different encodings
  private tryDifferentEncodings(fileName: string): string | null {
    try {
      // convert string to bytes
      const bytes = new Uint8Array(fileName.length);
      for (let i = 0; i < fileName.length; i++) {
        bytes[i] = fileName.charCodeAt(i);
      }

      // try different encodings
      // The macOS system zip tool creates archives with UTF-8 encoded filenames.
      // However, this implementation doesn't strictly adhere to the ZIP specification.
      // Simply forcing UTF-8 encoding when unzipping should resolve filename corruption issues.
      const encodings = ['utf-8'];

      for (const encoding of encodings) {
        try {
          const decoder = new TextDecoder(encoding);
          const result = decoder.decode(bytes);

          // check if decoded result is valid
          if (result && this.isValidDecodedString(result)) {
            return result;
          }
        } catch {
          // ignore encoding error, try next encoding
        }
      }
    } catch {
      // ignore conversion error
    }

    return null;
  }

  // check if decoded string is valid
  private isValidDecodedString(str: string): boolean {
    // check if contains control characters
    const controlCharCodes = new Set([
      0x00,
      0x01,
      0x02,
      0x03,
      0x04,
      0x05,
      0x06,
      0x07,
      0x08, // \x00-\x08
      0x0b,
      0x0c, // \x0B, \x0C
      0x0e,
      0x0f,
      0x10,
      0x11,
      0x12,
      0x13,
      0x14,
      0x15,
      0x16,
      0x17,
      0x18,
      0x19,
      0x1a,
      0x1b,
      0x1c,
      0x1d,
      0x1e,
      0x1f, // \x0E-\x1F
      0x7f, // \x7F
    ]);

    return !str
      .split('')
      .some(char => controlCharCodes.has(char.charCodeAt(0)));
  }

  *[Symbol.iterator]() {
    const keys = Object.keys(this.unzipped ?? {});
    let index = 0;
    while (keys.length) {
      const path = keys.shift()!;
      if (path.includes('__MACOSX') || path.includes('DS_Store')) {
        continue;
      }
      const lastSplitIndex = path.lastIndexOf('/');
      const fileName = path.substring(lastSplitIndex + 1);
      const fileExt =
        fileName.lastIndexOf('.') === -1 ? '' : fileName.split('.').at(-1);
      const mime = extMimeMap.get(fileExt ?? '');
      const content = new File([this.unzipped![path]], fileName, {
        type: mime ?? '',
      }) as Blob;

      const fixedPath = this.fixFileNameEncoding(path);

      yield { path: fixedPath, content, index };
      index++;
    }
  }
}

export async function createAssetsArchive(
  assetsMap: Map<string, Blob>,
  assetsIds: string[]
) {
  const zip = new Zip();

  for (const [id, blob] of assetsMap) {
    if (!assetsIds.includes(id)) continue;
    const name = getAssetName(assetsMap, id);
    await zip.folder('assets').file(name, blob);
  }

  return zip;
}

export function download(blob: Blob, name: string) {
  const element = document.createElement('a');
  element.setAttribute('download', name);
  const fileURL = URL.createObjectURL(blob);
  element.setAttribute('href', fileURL);
  element.style.display = 'none';
  document.body.append(element);
  element.click();
  element.remove();
  URL.revokeObjectURL(fileURL);
}

const metaMatcher = /(?<=---)(.*?)(?=---)/ms;
const bodyMatcher = /---.*?---/s;
export const parseMatter = (contents: string) => {
  const matterMatch = contents.match(metaMatcher);
  if (!matterMatch || !matterMatch[0]) return null;
  const metadata = loadYaml(matterMatch[0], { schema: FAILSAFE_SCHEMA });
  if (!metadata || typeof metadata !== 'object') return null;
  const body = contents.replace(bodyMatcher, '');
  return { matter: matterMatch[0], body, metadata };
};
