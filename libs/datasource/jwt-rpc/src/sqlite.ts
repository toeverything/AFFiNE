import * as Y from 'yjs';
import sqlite, { Database, SqlJsStatic } from 'sql.js';
import { Observable } from 'lib0/observable.js';

const PREFERRED_TRIM_SIZE = 500;

const STMTS = {
    create: 'CREATE TABLE updates (key INTEGER PRIMARY KEY AUTOINCREMENT, value BLOB);',
    selectAll: 'SELECT * FROM updates where key >= $idx',
    selectCount: 'SELECT count(*) FROM updates',
    insert: 'INSERT INTO updates VALUES (null, $data);',
    delete: 'DELETE FROM updates WHERE key < $idx',
    drop: 'DROP TABLE updates;',
};

const countUpdates = (db: Database) => {
    const [cnt] = db.exec(STMTS.selectCount);
    return cnt.values[0]?.[0] as number;
};

const clearUpdates = (db: Database, idx: number) => {
    db.exec(STMTS.delete, { $idx: idx });
};

const fetchUpdates = async (provider: SQLiteProvider) => {
    const db = provider.db!;
    const updates = db
        .exec(STMTS.selectAll, { $idx: provider._dbref })
        .flatMap(val => val.values as [number, Uint8Array][])
        .sort(([a], [b]) => a - b);
    Y.transact(
        provider.doc,
        () => {
            updates.forEach(([, update]) =>
                Y.applyUpdate(provider.doc, update)
            );
        },
        provider,
        false
    );

    const lastKey = Math.max(...updates.map(([idx]) => idx));
    provider._dbref = lastKey + 1;
    provider._dbsize = countUpdates(db);
    return db;
};

const storeState = async (provider: SQLiteProvider, forceStore = true) => {
    const db = await fetchUpdates(provider);

    if (forceStore || provider._dbsize >= PREFERRED_TRIM_SIZE) {
        db.exec(STMTS.insert, { $data: Y.encodeStateAsUpdate(provider.doc) });

        clearUpdates(db, provider._dbref);

        provider._dbsize = countUpdates(db);
        console.log(db.export());
    }
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
            new URL('sql.js/dist/sql-wasm.wasm', import.meta.url).href,
    });
    _sqliteProcessing = false;
    return _sqliteInstance;
};

export class SQLiteProvider extends Observable<string> {
    doc: Y.Doc;
    name: string;
    _dbref: number;
    _dbsize: number;
    private _destroyed: boolean;
    whenSynced: Promise<SQLiteProvider>;
    db: Database | null;
    private _db: Promise<Database>;
    synced: boolean;
    _storeTimeout: number;
    _storeTimeoutId: NodeJS.Timeout | null;
    _storeUpdate: (update: Uint8Array, origin: any) => void;

    constructor(dbname: string, doc: Y.Doc) {
        super();

        this.doc = doc;
        this.name = dbname;

        this._dbref = 0;
        this._dbsize = 0;
        this._destroyed = false;
        this.db = null;
        this.synced = false;

        this._db = initSQLiteInstance().then(db => {
            const sqlite = new db.Database();
            return sqlite.run(STMTS.create);
        });

        this.whenSynced = this._db.then(async db => {
            this.db = db;
            const currState = Y.encodeStateAsUpdate(doc);
            await fetchUpdates(this);
            db.exec(STMTS.insert, { $data: currState });
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
                this.db.exec(STMTS.insert, { $data: update });

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

    override destroy(): Promise<void> {
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

    // Destroys this instance and removes all data from SQLite.
    async clearData(): Promise<void> {
        return this._db.then(db => {
            db.exec(STMTS.drop);
            return this.destroy();
        });
    }
}
