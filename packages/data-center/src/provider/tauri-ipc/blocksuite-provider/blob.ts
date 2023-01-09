import {
  BlobId,
  BlobProvider,
  BlobURL,
} from '@blocksuite/store/dist/blob/types';
import * as ipcMethods from '../ipc/methods.js';
import { Signal } from '@blocksuite/store';

export class IPCBlobProvider implements BlobProvider {
  #ipc = ipcMethods;

  blobs: Set<BlobId>;
  signals: {
    blobAdded: Signal<BlobId>;
  };

  static async init(
    workspace: string,
    cloudApi?: string
  ): Promise<IPCBlobProvider> {
    const provider = new IPCBlobProvider(workspace, cloudApi);
    await provider._initBlobs();
    return provider;
  }

  async get(id: BlobId): Promise<BlobURL | null> {
    const blobArray = await this.#ipc.getBlob({
      id,
    });
    // Make a Blob from the bytes
    const blob = new Blob([new Uint8Array(blobArray)], { type: 'image/bmp' });
    return window.URL.createObjectURL(blob);
  }

  async set(blob: Blob): Promise<BlobId> {
    return this.#ipc.putBlob({
      blob: Array.from(new Uint8Array(await blob.arrayBuffer())),
    });
  }

  delete(id: BlobId): Promise<void>;
  clear(): Promise<void>;
}
