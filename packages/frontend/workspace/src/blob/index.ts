import { BlobEngine } from './engine';
import {
  createAffineCloudBlobStorage,
  createIndexeddbBlobStorage,
  createSQLiteBlobStorage,
  createStaticBlobStorage,
} from './storage';

export * from './engine';
export * from './storage';

export function createLocalBlobStorage(workspaceId: string) {
  if (environment.isDesktop) {
    return createSQLiteBlobStorage(workspaceId);
  } else {
    return createIndexeddbBlobStorage(workspaceId);
  }
}

export function createLocalBlobEngine(workspaceId: string) {
  return new BlobEngine(createLocalBlobStorage(workspaceId), [
    createStaticBlobStorage(),
  ]);
}

export function createAffineCloudBlobEngine(workspaceId: string) {
  return new BlobEngine(createLocalBlobStorage(workspaceId), [
    createStaticBlobStorage(),
    createAffineCloudBlobStorage(workspaceId),
  ]);
}

export function createAffinePublicBlobEngine(workspaceId: string) {
  return new BlobEngine(createAffineCloudBlobStorage(workspaceId), [
    createStaticBlobStorage(),
  ]);
}
