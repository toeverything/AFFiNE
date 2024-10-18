import type {
  BlobStorage,
  DocStorage,
  Storage,
  StorageOptions,
  SyncStorage,
} from './storage';
import { Connection } from './storage';

interface StorageTypes {
  doc: DocStorage;
  blob: BlobStorage;
  sync: SyncStorage;
}

export abstract class StorageManager extends Connection {
  protected storages: Record<string, Storage> = {};

  constructor(public readonly options: StorageOptions) {
    super();
  }

  override async connect() {
    if (!this.connected) {
      await this.doConnect();
      await Promise.all(
        Object.values(this.storages).map(storage => storage.connect())
      );
      this._connected = true;
    }
  }

  override async disconnect() {
    await Promise.all(
      Object.values(this.storages).map(storage => storage.disconnect())
    );
    await this.doDisconnect();
    this._connected = false;
  }

  get<Type extends keyof StorageTypes>(type: Type): StorageTypes[Type] {
    const storage = this.storages[type];
    if (!storage) {
      throw new Error(
        `Unregistered storage type requested.\nWant: ${type}\n.Registered: ${Object.keys(this.storages).join(', ')}.`
      );
    }

    // @ts-expect-error we have typecheck on adding
    return storage;
  }

  add<Type extends keyof StorageTypes>(
    type: Type,
    storage: StorageTypes[Type]
  ) {
    this.storages[type] = storage;
  }

  remove<Type extends keyof StorageTypes>(type: Type) {
    delete this.storages[type];
  }
}
