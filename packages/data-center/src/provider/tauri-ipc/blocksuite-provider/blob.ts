import { BlobSyncState } from '@blocksuite/store';
import { Signal } from '@blocksuite/store';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import type {
  BlobId,
  BlobProvider,
  BlobSyncStateChangeEvent,
  BlobURL,
} from '@blocksuite/store/dist/persistence/blob/types';

import * as ipcMethods from '../ipc/methods';

export class IPCBlobProvider implements BlobProvider {
  #ipc = ipcMethods;

  #workspace: string;

  readonly signals = {
    onBlobSyncStateChange: new Signal<BlobSyncStateChangeEvent>(),
  };

  private constructor(workspace: string) {
    this.#workspace = workspace;
  }

  static async init(workspace: string): Promise<IPCBlobProvider> {
    const provider = new IPCBlobProvider(workspace);
    return provider;
  }

  get uploading() {
    return false;
  }

  get blobs() {
    // TODO: implement blob list in Octobase
    return Promise.resolve([]) as Promise<string[]>;
  }

  async get(id: BlobId): Promise<BlobURL | null> {
    const blobArray = await this.#ipc.getBlob({
      id,
    });
    // Make a Blob from the bytes
    const blob = new Blob([new Uint8Array(blobArray)], { type: 'image/bmp' });
    this.signals.onBlobSyncStateChange.emit({
      id,
      state: BlobSyncState.Success,
    });
    return window.URL.createObjectURL(blob);
  }

  async set(blob: Blob): Promise<BlobId> {
    // TODO: skip if already has
    const blobID = await this.#ipc.putBlob({
      blob: Array.from(new Uint8Array(await blob.arrayBuffer())),
    });
    this.signals.onBlobSyncStateChange.emit({
      id: blobID,
      state: BlobSyncState.Success,
    });
    return blobID;
  }

  async delete(id: BlobId): Promise<void> {
    // TODO: implement blob delete in Octobase
  }

  async clear(): Promise<void> {
    // TODO: implement blob clear in Octobase, use workspace id #workspace
  }
}
