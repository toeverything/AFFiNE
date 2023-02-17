/* eslint-disable @typescript-eslint/no-explicit-any */
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import * as idb from 'lib0/indexeddb';
import { Observable } from 'lib0/observable';

const customStoreName = 'custom';
const updatesStoreName = 'updates';

const PREFERRED_TRIM_SIZE = 500;

const {
  Y: { applyUpdate, transact, encodeStateAsUpdate },
} = BlocksuiteWorkspace;

type Doc = Parameters<typeof transact>[0];

const fetchUpdates = async (provider: IndexedDBProvider) => {
  const [updatesStore] = idb.transact(provider.db as IDBDatabase, [
    updatesStoreName,
  ]); // , 'readonly')
  if (updatesStore) {
    const updates = await idb.getAll(
      updatesStore,
      idb.createIDBKeyRangeLowerBound(provider._dbref, false)
    );
    transact(
      provider.doc,
      () => {
        updates.forEach(val => applyUpdate(provider.doc, val));
      },
      provider,
      false
    );
    const lastKey = await idb.getLastKey(updatesStore);
    provider._dbref = lastKey + 1;
    const cnt = await idb.count(updatesStore);
    provider._dbsize = cnt;
  }
  return updatesStore;
};

const storeState = (provider: IndexedDBProvider, forceStore = true) =>
  fetchUpdates(provider).then(updatesStore => {
    if (
      updatesStore &&
      (forceStore || provider._dbsize >= PREFERRED_TRIM_SIZE)
    ) {
      idb
        .addAutoKey(updatesStore, encodeStateAsUpdate(provider.doc))
        .then(() =>
          idb.del(
            updatesStore,
            idb.createIDBKeyRangeUpperBound(provider._dbref, true)
          )
        )
        .then(() =>
          idb.count(updatesStore).then(cnt => {
            provider._dbsize = cnt;
          })
        );
    }
  });

export class IndexedDBProvider extends Observable<string> {
  doc: Doc;
  name: string;
  _dbref: number;
  _dbsize: number;
  private _destroyed: boolean;
  whenSynced: Promise<IndexedDBProvider>;
  db: IDBDatabase | null;
  private _db: Promise<IDBDatabase>;
  private _storeTimeout: number;
  private _storeTimeoutId: NodeJS.Timeout | null;
  private _storeUpdate: (update: Uint8Array, origin: any) => void;

  constructor(name: string, doc: Doc) {
    super();
    this.doc = doc;
    this.name = name;
    this._dbref = 0;
    this._dbsize = 0;
    this._destroyed = false;
    this.db = null;
    this._db = idb.openDB(name, db =>
      idb.createStores(db, [['updates', { autoIncrement: true }], ['custom']])
    );

    this.whenSynced = this._db.then(async db => {
      this.db = db;
      const currState = encodeStateAsUpdate(doc);
      const updatesStore = await fetchUpdates(this);
      if (updatesStore) {
        await idb.addAutoKey(updatesStore, currState);
      }
      if (this._destroyed) {
        return this;
      }
      this.emit('synced', [this]);
      return this;
    });

    // Timeout in ms untill data is merged and persisted in idb.
    this._storeTimeout = 1000;

    this._storeTimeoutId = null;

    this._storeUpdate = (update: Uint8Array, origin: any) => {
      if (this.db && origin !== this) {
        const [updatesStore] = idb.transact(
          /** @type {IDBDatabase} */ this.db,
          [updatesStoreName]
        );
        if (updatesStore) {
          idb.addAutoKey(updatesStore, update);
        }
        if (++this._dbsize >= PREFERRED_TRIM_SIZE) {
          // debounce store call
          if (this._storeTimeoutId !== null) {
            clearTimeout(this._storeTimeoutId);
          }
          this._storeTimeoutId = setTimeout(() => {
            storeState(this, false);
            this._storeTimeoutId = null;
          }, this._storeTimeout);
        }
      }
    };
    doc.on('update', this._storeUpdate);
    this.destroy = this.destroy.bind(this);
    doc.on('destroy', this.destroy);
  }

  override destroy() {
    if (this._storeTimeoutId) {
      clearTimeout(this._storeTimeoutId);
    }
    this.doc.off('update', this._storeUpdate);
    this.doc.off('destroy', this.destroy);
    this._destroyed = true;
    return this._db.then(db => {
      db.close();
    });
  }

  /**
   * Destroys this instance and removes all data from indexeddb.
   *
   * @return {Promise<void>}
   */
  async clearData(): Promise<void> {
    return this.destroy().then(() => {
      idb.deleteDB(this.name);
    });
  }

  /**
   * @param {String | number | ArrayBuffer | Date} key
   * @return {Promise<String | number | ArrayBuffer | Date | any>}
   */
  async get(
    key: string | number | ArrayBuffer | Date
  ): Promise<string | number | ArrayBuffer | Date | any> {
    return this._db.then(db => {
      const [custom] = idb.transact(db, [customStoreName], 'readonly');
      if (custom) {
        return idb.get(custom, key);
      }
      return undefined;
    });
  }

  /**
   * @param {String | number | ArrayBuffer | Date} key
   * @param {String | number | ArrayBuffer | Date} value
   * @return {Promise<String | number | ArrayBuffer | Date>}
   */
  async set(
    key: string | number | ArrayBuffer | Date,
    value: string | number | ArrayBuffer | Date
  ): Promise<string | number | ArrayBuffer | Date> {
    return this._db.then(db => {
      const [custom] = idb.transact(db, [customStoreName]);
      if (custom) {
        return idb.put(custom, value, key);
      }
      return undefined;
    });
  }

  /**
   * @param {String | number | ArrayBuffer | Date} key
   * @return {Promise<undefined>}
   */
  async del(key: string | number | ArrayBuffer | Date): Promise<undefined> {
    return this._db.then(db => {
      const [custom] = idb.transact(db, [customStoreName]);
      if (custom) {
        return idb.del(custom, key);
      }
      return undefined;
    });
  }

  static delete(name: string): Promise<void> {
    return idb.deleteDB(name);
  }
}
