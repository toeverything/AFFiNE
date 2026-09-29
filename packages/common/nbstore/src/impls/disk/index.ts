import type { StorageConstructor } from '..';
import { DiskDocStorage } from './doc';

export * from './api';
export * from './doc';

export const diskStorages = [DiskDocStorage] satisfies StorageConstructor[];
