import { BlobSyncState } from '@blocksuite/store';
import * as ipcMethods from '../ipc/methods.js';
import { BlobOptionsGetter, Signal } from '@blocksuite/store';
import type {
  BlobProvider,
  BlobSyncStateChangeEvent,
  BlobId,
  BlobURL,
} from '@blocksuite/store/dist/persistence/blob/types.js';

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
    if (blob) {
      this.signals.onBlobSyncStateChange.emit({
        id,
        state: BlobSyncState.Success,
      });
    }
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
