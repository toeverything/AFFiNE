import { extMimeMap, getAssetName } from '@blocksuite/store';
import * as fflate from 'fflate';

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
      yield { path, content, index };
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
