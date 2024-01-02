import { createIndexeddbBlobStorage } from './blob-indexeddb';
import { createSQLiteBlobStorage } from './blob-sqlite';

export function createLocalBlobStorage(workspaceId: string) {
  if (environment.isDesktop) {
    return createSQLiteBlobStorage(workspaceId);
  } else {
    return createIndexeddbBlobStorage(workspaceId);
  }
}
