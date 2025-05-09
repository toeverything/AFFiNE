// This is a totally copy of definitions in [@affine/space-store]
// because currently importing cross workspace package from [@affine/server] is not yet supported
// should be kept updated with the original definitions in [@affine/space-store]
import type { BlobStorageAdapter } from './blob';
import { Connection } from './connection';
import type { DocStorageAdapter } from './doc';

export class SpaceStorage extends Connection {
  constructor(
    public readonly doc: DocStorageAdapter,
    public readonly blob: BlobStorageAdapter
  ) {
    super();
  }

  override async connect() {
    await this.doc.connect();
    await this.blob.connect();
  }

  override async disconnect() {
    await this.doc.disconnect();
    await this.blob.disconnect();
  }
}

export { BlobStorageAdapter, type BlobStorageOptions } from './blob';
export {
  type DocDiff,
  type DocRecord,
  DocStorageAdapter,
  type DocStorageOptions,
  type DocUpdate,
  type Editor,
  type HistoryFilter,
} from './doc';
