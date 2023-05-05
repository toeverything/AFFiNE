import type { DBSchema, IDBPDatabase } from 'idb/build/entry';

export const dbVersion = 1;
export const DEFAULT_DB_NAME = 'affine-local';

export function upgradeDB(db: IDBPDatabase<BlockSuiteBinaryDB>) {
  db.createObjectStore('workspace', { keyPath: 'id' });
  db.createObjectStore('milestone', { keyPath: 'id' });
}

export interface IndexedDBProvider {
  connect: () => void;
  disconnect: () => void;
  cleanup: () => Promise<void>;
  whenSynced: Promise<void>;
}

export type UpdateMessage = {
  timestamp: number;
  update: Uint8Array;
};

export type WorkspacePersist = {
  id: string;
  updates: UpdateMessage[];
};

export type WorkspaceMilestone = {
  id: string;
  milestone: Record<string, Uint8Array>;
};

export interface BlockSuiteBinaryDB extends DBSchema {
  workspace: {
    key: string;
    value: WorkspacePersist;
  };
  milestone: {
    key: string;
    value: WorkspaceMilestone;
  };
}

export interface OldYjsDB extends DBSchema {
  updates: {
    key: number;
    value: Uint8Array;
  };
}
