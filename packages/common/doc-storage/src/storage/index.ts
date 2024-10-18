import type { BlobStorage } from './blob';
import { Connection } from './connection';
import type { DocStorage } from './doc';
import type { StorageOptions } from './storage';

export * from './blob';
export * from './doc';

export abstract class Storage<Opts extends StorageOptions> extends Connection {
  abstract readonly doc: DocStorage;
  abstract readonly blob: BlobStorage;

  constructor(public readonly options: Opts) {
    super();
  }

  override async connect() {
    if (!this.connected) {
      this.connected = true;
      await this.doc.connect();
      await this.blob.connect();
    }
  }

  override async disconnect() {
    await this.doc.disconnect();
    await this.blob.disconnect();
    this.connected = false;
  }
}
