import type { StorageConstructor } from '..';
import { CloudAwarenessStorage } from './awareness';
import { CloudBlobStorage } from './blob';
import { CloudDocStorage } from './doc';
import { StaticCloudDocStorage } from './doc-static';

export * from './awareness';
export * from './blob';
export * from './doc';
export * from './doc-static';
export * from './socket';

export const cloudStorages = [
  CloudDocStorage,
  StaticCloudDocStorage,
  CloudBlobStorage,
  CloudAwarenessStorage,
] satisfies StorageConstructor[];
