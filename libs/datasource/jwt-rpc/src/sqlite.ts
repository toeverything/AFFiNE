import * as Y from 'yjs';
import sqlite, { Database, SqlJsStatic } from 'sql.js';
import { Observable } from 'lib0/observable.js';

const PREFERRED_TRIM_SIZE = 500;

const _stmts = {
    create: 'CREATE TABLE updates (key INTEGER PRIMARY KEY AUTOINCREMENT, value BLOB);',
    selectAll: 'SELECT * FROM updates where key >= $idx',
    selectCount: 'SELECT count(*) FROM updates',
    insert: 'INSERT INTO updates VALUES (null, $data);',
    delete: 'DELETE FROM updates WHERE key < $idx',
    drop: 'DROP TABLE updates;',
};

const countUpdates = (db: Database) => {
    const [cnt] = db.exec(_stmts.selectCount);
    return cnt.values[0]?.[0] as number;
};

const clearUpdates = (db: Database, idx: number) => {
    db.exec(_stmts.delete, { $idx: idx });
};

const getAllUpdates = (db: Database, idx: number) => {
    return db
        .exec(_stmts.selectAll, { $idx: idx })
        .flatMap(val => val.values as [number, Uint8Array][])
        .sort(([a], [b]) => a - b);
};

let _sqliteInstance: SqlJsStatic | undefined;
let _sqliteProcessing = false;

const sleep = () => new Promise(resolve => setTimeout(resolve, 500));
const initSQLiteInstance = async () => {
    while (_sqliteProcessing) {
        await sleep();
    }
    if (_sqliteInstance) return _sqliteInstance;
    _sqliteProcessing = true;
    _sqliteInstance = await sqlite({
        locateFile: () =>
            // @ts-ignore
            new URL('sql.js/dist/sql-wasm.wasm', import.meta.url).href,
    });
    _sqliteProcessing = false;
    return _sqliteInstance;
};

export class SQLiteProvider extends Observable<string> {
    doc: Y.Doc;
    name: string;
    db: Database | null;
    whenSynced: Promise<SQLiteProvider>;
    synced: boolean;

    private _ref: number;
    private _size: number;
    private _destroyed: boolean;
    private _db: Promise<Database>;
    private _saver?: (binary: Uint8Array) => void;
    private _destroy: () => void;

    constructor(name: string, doc: Y.Doc, origin?: Uint8Array) {
        super();

        this.doc = doc;
        this.name = name;

        this._ref = 0;
        this._size = 0;
        this._destroyed = false;
        this.db = null;
        this.synced = false;

        this._db = initSQLiteInstance().then(db => {
            const sqlite = new db.Database(origin);
            return sqlite.run(_stmts.create);
        });

        this.whenSynced = this._db.then(async db => {
            this.db = db;
            const currState = Y.encodeStateAsUpdate(doc);
            await this._fetchUpdates();
            db.exec(_stmts.insert, { $data: currState });
            if (this._destroyed) return this;
            this.emit('synced', [this]);
            this.synced = true;
            return this;
        });

        // Timeout in ms until data is merged and persisted in sqlite.
        const storeTimeout = 1000;
        let storeTimeoutId: NodeJS.Timer | undefined = undefined;

        const storeUpdate = (update: Uint8Array, origin: any) => {
            if (this._saver && this.db && origin !== this) {
                this.db.exec(_stmts.insert, { $data: update });

                if (++this._size >= PREFERRED_TRIM_SIZE) {
                    // debounce store call
                    if (storeTimeoutId) clearTimeout(storeTimeoutId);

                    storeTimeoutId = setTimeout(() => {
                        this._storeState();
                        storeTimeoutId = undefined;
                    }, storeTimeout);
                }
            }
        };

        doc.on('update', storeUpdate);
        this.destroy = this.destroy.bind(this);
        doc.on('destroy', this.destroy);

        this._destroy = () => {
            if (storeTimeoutId) clearTimeout(storeTimeoutId);

            this.doc.off('update', storeUpdate);
            this.doc.off('destroy', this.destroy);
        };
    }

    registerExporter(saver: (binary: Uint8Array) => void) {
        this._saver = saver;
    }

    private async _storeState() {
        await this._fetchUpdates();

        if (this.db && this._size >= PREFERRED_TRIM_SIZE) {
            this.db.exec(_stmts.insert, {
                $data: Y.encodeStateAsUpdate(this.doc),
            });

            clearUpdates(this.db, this._ref);

            this._size = countUpdates(this.db);

            this._saver?.(this.db?.export());
        }
    }

    private async _fetchUpdates() {
        if (this.db) {
            const updates = getAllUpdates(this.db, this._ref);

            Y.transact(
                this.doc,
                () => {
                    updates.forEach(([, update]) =>
                        Y.applyUpdate(this.doc, update)
                    );
                },
                this,
                false
            );

            const lastKey = Math.max(...updates.map(([idx]) => idx));
            this._ref = lastKey + 1;
            this._size = countUpdates(this.db);
        }
    }

    override destroy(): Promise<void> {
        this._destroy();
        this._destroyed = true;
        return this._db.then(db => {
            db.close();
        });
    }

    // Destroys this instance and removes all data from SQLite.
    async clearData(): Promise<void> {
        return this._db.then(db => {
            db.exec(_stmts.drop);
            return this.destroy();
        });
    }
}
