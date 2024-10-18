# @affine/doc-storage

## Storages

### StorageNode

```ts
import { StorageManager } from '@affine/doc-storage';

class CloudStorageManager extends StorageManager {
  private readonly socket = io('http://endpoint');

  constructor(options: StorageOptions) {
    super(options);
    this.add(
      'doc',
      new CloudDocStorage({
        ...this.options,
        socket: this.socket,
      })
    );
    this.add(
      'blob',
      new CloudBlobStorage({
        ...this.options,
        socket: this.socket,
      })
    );
  }

  override async doConnect() {
    await this.socket.connect();
  }

  override async doDisconnect() {
    await this.socket.close();
  }
}
```

### StorageEdgeNode

```ts
interface SqliteStorageOptions extends StorageOptions {
  dbPath: string;
}

class SqliteStorage extends CloudStorageManager<SqliteStorageOptions> {
  constructor(options: StorageOptions) {
    super(options);
    this.db = new Sqlite(this.options.dbPath);

    this.add('doc', new SqliteDocStorage({ ...this.options, db: this.db }));
    this.add('blob', new SqliteBlobStorage({ ...this.options, db: this.db }));
    this.add('sync', new SqliteSyncStorage({ ...this.options, db: this.db }));
  }

  override async doConnect() {
    await this.db.connect();
  }

  override async doDisconnect() {
    await this.db.close();
  }
}
```

## Compose storages

```ts
interface SqliteStorageOptions extends StorageOptions {
  dbPath: string;
}

class SqliteStorage extends CloudStorageManager<SqliteStorageOptions> {
  idb!: SpaceIDB | null = null;

  constructor(options: StorageOptions) {
    super(options);
    this.db = new Sqlite(this.options.dbPath);

    this.add('doc', new SqliteDocStorage({ ...this.options, db: this.db }));
  }

  override async doConnect() {
    await this.db.connect();
    this.idb = await IDBProtocol.open(`${this.spaceType}:${this.spaceId}`);
    this.add('blob', new IDBBlobStorage({ ...this.options, idb: this.idb }));
  }

  override async doDisconnect() {
    await this.db.close();
    await this.idb?.close();
    this.remove('blob');
  }
}
```
