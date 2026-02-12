import { type IDBPDatabase, openDB } from 'idb';

import { AutoReconnectConnection } from '../../connection';
import type { SpaceType } from '../../utils/universal-id';
import { type DocStorageSchema, migrator } from './schema';

export interface IDBConnectionOptions {
  flavour: string;
  type: SpaceType;
  id: string;
}

export class IDBConnection extends AutoReconnectConnection<{
  db: IDBPDatabase<DocStorageSchema>;
  channel: BroadcastChannel;
}> {
  readonly dbName = `${this.opts.flavour}:${this.opts.type}:${this.opts.id}`;

  override get shareId() {
    return `idb(${migrator.version}):${this.dbName}`;
  }

  constructor(private readonly opts: IDBConnectionOptions) {
    super();
  }

  override async doConnect() {
    // indexeddb will responsible for version control, so the db.version always match migrator.version
    const db = await openDB<DocStorageSchema>(this.dbName, migrator.version, {
      upgrade: migrator.migrate,
    });
    db.addEventListener('versionchange', this.handleVersionChange);

    return {
      db,
      channel: new BroadcastChannel('idb:' + this.dbName),
    };
  }

  override doDisconnect(db: {
    db: IDBPDatabase<DocStorageSchema>;
    channel: BroadcastChannel;
  }) {
    db.db.removeEventListener('versionchange', this.handleVersionChange);
    db.channel.close();
    db.db.close();
  }

  handleVersionChange = (e: IDBVersionChangeEvent) => {
    if (e.newVersion !== migrator.version) {
      this.error = new Error(
        'Database version mismatch, expected ' +
          migrator.version +
          ' but got ' +
          e.newVersion
      );
    }
  };
}
