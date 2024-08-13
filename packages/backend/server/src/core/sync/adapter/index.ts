import type { WorkspaceBlobStorageAdapter } from './blob';
import { Connection } from './connection';
import type { WorkspaceDocStorageAdapter } from './doc';

export class WorkspaceSyncProvider extends Connection {
  constructor(
    public readonly doc: WorkspaceDocStorageAdapter,
    public readonly blob: WorkspaceBlobStorageAdapter
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

export {
  WorkspaceBlobStorageAdapter,
  type WorkspaceBlobStorageOptions,
} from './blob';
export {
  type DocRecord,
  type DocUpdate,
  WorkspaceDocStorageAdapter,
  type WorkspaceDocStorageOptions,
} from './doc';
