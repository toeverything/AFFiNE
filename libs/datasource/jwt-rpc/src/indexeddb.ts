import * as Y from 'yjs';
import * as idb from 'lib0/indexeddb.js';
import * as mutex from 'lib0/mutex.js';
import { Observable } from 'lib0/observable.js';

const customStoreName = 'custom';
const updatesStoreName = 'updates';

const PREFERRED_TRIM_SIZE = 500;

const fetchUpdates = async (provider: IndexedDBProvider) => {
    const [updatesStore] = idb.transact(provider.db as IDBDatabase, [
        updatesStoreName,
    ]); // , 'readonly')
    const updates = await idb.getAll(
        updatesStore,
        idb.createIDBKeyRangeLowerBound(provider._dbref, false)
    );
    Y.transact(
        provider.doc,
        () => {
            updates.forEach(val => Y.applyUpdate(provider.doc, val));
        },
        provider,
        false
    );
    const lastKey = await idb.getLastKey(updatesStore);
    provider._dbref = lastKey + 1;
    const cnt = await idb.count(updatesStore);
    provider._dbsize = cnt;
    return updatesStore;
};

const storeState = (provider: IndexedDBProvider, forceStore = true) =>
    fetchUpdates(provider).then(updatesStore => {
        if (forceStore || provider._dbsize >= PREFERRED_TRIM_SIZE) {
            idb.addAutoKey(updatesStore, Y.encodeStateAsUpdate(provider.doc))
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
    doc: Y.Doc;
    name: string;
    private _mux: mutex.mutex;
    _dbref: number;
    _dbsize: number;
    private _destroyed: boolean;
    whenSynced: Promise<IndexedDBProvider>;
    db: IDBDatabase | null;
    private _db: Promise<IDBDatabase>;
    private synced: boolean;
    private _storeTimeout: number;
    private _storeTimeoutId: NodeJS.Timeout | null;
    private _storeUpdate: (update: Uint8Array, origin: any) => void;

    constructor(name: string, doc: Y.Doc) {
        super();
        this.doc = doc;
        this.name = name;
        this._mux = mutex.createMutex();
        this._dbref = 0;
        this._dbsize = 0;
        this._destroyed = false;
        this.db = null;
        this.synced = false;
        this._db = idb.openDB(name, db =>
            idb.createStores(db, [
                ['updates', { autoIncrement: true }],
                ['custom'],
            ])
        );

        this.whenSynced = this._db.then(async db => {
            this.db = db;
            const currState = Y.encodeStateAsUpdate(doc);
            const updatesStore = await fetchUpdates(this);
            await idb.addAutoKey(updatesStore, currState);
            if (this._destroyed) return this;
            this.emit('synced', [this]);
            this.synced = true;
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
                idb.addAutoKey(updatesStore, update);
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
            return idb.get(custom, key);
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
            return idb.put(custom, value, key);
        });
    }

    /**
     * @param {String | number | ArrayBuffer | Date} key
     * @return {Promise<undefined>}
     */
    async del(key: string | number | ArrayBuffer | Date): Promise<undefined> {
        return this._db.then(db => {
            const [custom] = idb.transact(db, [customStoreName]);
            return idb.del(custom, key);
        });
    }
}
