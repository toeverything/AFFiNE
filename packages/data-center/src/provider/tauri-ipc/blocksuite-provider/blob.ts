import {
  BlobId,
  BlobProvider,
  BlobURL,
} from '@blocksuite/store/dist/blob/types';
import * as ipcMethods from '../ipc/methods.js';
import { Signal } from '@blocksuite/store';

// @staticImplements<BlobProviderStatic>()
export class IPCBlobProvider implements BlobProvider {
  #ipc = ipcMethods;

  readonly blobs: Set<string> = new Set();
  readonly signals = {
    blobAdded: new Signal<BlobId>(),
    blobDeleted: new Signal<BlobId>(),
  };

  async get(id: BlobId): Promise<BlobURL | null> {
    const blobArray = await this.#ipc.getBlob({
      id,
    });
    // Make a Blob from the bytes
    const blob = new Blob([new Uint8Array(blobArray)], { type: 'image/bmp' });
    if (blob) {
      this.signals.blobAdded.emit(id);
      this.blobs.add(id);
    }
    return window.URL.createObjectURL(blob);
  }

  async set(blob: Blob): Promise<BlobId> {
    // TODO: skip if already has
    const blobID = await this.#ipc.putBlob({
      blob: Array.from(new Uint8Array(await blob.arrayBuffer())),
    });
    this.signals.blobAdded.emit(blobID);
    return blobID;
  }

  // TODO: implement getAllKeys in Octobase
  // private async _initBlobs() {
  //   const entries = await this._database.keys();
  //   for (const key of entries) {
  //     const blobId = key as BlobId;
  //     this.signals.blobAdded.emit(blobId);
  //     this.blobs.add(blobId);
  //   }
  // }

  async delete(id: BlobId): Promise<void> {
    // TODO: implement blob delete in Octobase
    this.signals.blobDeleted.emit(id);
    this.blobs.delete(id);
  }

  async clear(): Promise<void> {
    // TODO: implement blob clear in Octobase, need workspace id
    // await this._database.clear();
    this.blobs.clear();
  }
}
