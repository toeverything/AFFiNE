import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import { AutoReconnectConnection } from '../../../connection';

export interface DocDBSchema extends DBSchema {
  workspace: {
    key: string;
    value: {
      id: string;
      updates: {
        timestamp: number;
        update: Uint8Array;
      }[];
    };
  };
}

export class DocIDBConnection extends AutoReconnectConnection<IDBPDatabase<DocDBSchema> | null> {
  override get shareId() {
    return 'idb(old):affine-local';
  }

  override async doConnect() {
    const dbs = await indexedDB.databases();
    if (dbs.some(d => d.name === 'affine-local')) {
      return openDB<DocDBSchema>('affine-local', 1, {
        upgrade: db => {
          db.createObjectStore('workspace', { keyPath: 'id' });
        },
      });
    } else {
      return null;
    }
  }

  override doDisconnect(conn: IDBPDatabase<DocDBSchema> | null) {
    conn?.close();
  }
}

export interface BlobDBSchema extends DBSchema {
  blob: {
    key: string;
    value: ArrayBuffer;
  };
}

export interface BlobIDBConnectionOptions {
  id: string;
}

export class BlobIDBConnection extends AutoReconnectConnection<IDBPDatabase<BlobDBSchema> | null> {
  constructor(private readonly options: BlobIDBConnectionOptions) {
    super();
  }

  override get shareId() {
    return `idb(old-blob):${this.options.id}`;
  }

  override async doConnect() {
    const dbs = await indexedDB.databases();
    if (dbs.some(d => d.name === `${this.options.id}_blob`)) {
      return openDB<BlobDBSchema>(`${this.options.id}_blob`, 1, {
        upgrade: db => {
          db.createObjectStore('blob');
        },
      });
    } else {
      return null;
    }
  }

  override doDisconnect(conn: IDBPDatabase<BlobDBSchema> | null) {
    conn?.close();
  }
}
