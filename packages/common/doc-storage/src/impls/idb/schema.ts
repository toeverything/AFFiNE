import type { DBSchema, OpenDBCallbacks } from 'idb';
/**
IndexedDB
  > DB(workspace:${workspaceId})
     > Table(Snapshots)
     > Table(Updates)
     > Table(...)

Table(Snapshots)
|docId|blob|createdAt|updatedAt|
|-----|----|---------|---------|
| str | bin| Date    | Date    |

Table(Updates)
| id |docId|blob|createdAt|
|----|-----|----|---------|
|auto| str | bin| Date    |

Table(Clocks)
| docId | clock  |
|-------|--------|
|  str  | number |
 */
export interface DocStorageSchema extends DBSchema {
  snapshots: {
    key: string;
    value: {
      docId: string;
      bin: Uint8Array;
      createdAt: number;
      updatedAt: number;
    };
    indexes: {
      updatedAt: number;
    };
  };
  updates: {
    key: [string, number];
    value: {
      docId: string;
      bin: Uint8Array;
      createdAt: number;
    };
    indexes: {
      docId: string;
    };
  };
  clocks: {
    key: string;
    value: {
      docId: string;
      timestamp: number;
    };
    indexes: {
      timestamp: number;
    };
  };
  peerClocks: {
    key: [string, string];
    value: {
      docId: string;
      peerId: string;
      clock: number;
    };
    indexes: {
      clock: number;
    };
  };
}

export const migrate: OpenDBCallbacks<DocStorageSchema>['upgrade'] = (
  db,
  oldVersion,
  _newVersion,
  trx
) => {
  if (!oldVersion) {
    oldVersion = 0;
  }

  for (let i = oldVersion; i < migrations.length; i++) {
    migrations[i](db, trx);
  }
};

type MigrateParameters = Parameters<
  NonNullable<OpenDBCallbacks<DocStorageSchema>['upgrade']>
>;
type Migrate = (db: MigrateParameters[0], trx: MigrateParameters[3]) => void;

// START REGION: migrations
const init: Migrate = db => {
  const snapshots = db.createObjectStore('snapshots', {
    keyPath: 'docId',
    autoIncrement: false,
  });

  snapshots.createIndex('updatedAt', 'updatedAt', { unique: false });

  const updates = db.createObjectStore('updates', {
    keyPath: ['docId', 'createdAt'],
    autoIncrement: false,
  });

  updates.createIndex('docId', 'docId', { unique: false });

  const clocks = db.createObjectStore('clocks', {
    keyPath: 'docId',
    autoIncrement: false,
  });

  clocks.createIndex('timestamp', 'timestamp', { unique: false });
};
// END REGION

// 1. all schema changed should be put in migrations
// 2.order matters
const migrations: Migrate[] = [init];

export const latestVersion = migrations.length;
