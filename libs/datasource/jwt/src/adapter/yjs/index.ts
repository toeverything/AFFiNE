/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unused-vars */
/// <reference types="wicg-file-system-access" />
import { Buffer } from 'buffer';
import { saveAs } from 'file-saver';
import { fromEvent } from 'file-selector';
import LRUCache from 'lru-cache';
import { debounce } from 'ts-debounce';
import { nanoid } from 'nanoid';
import { Awareness } from 'y-protocols/awareness.js';
import {
    Doc,
    Array as YArray,
    Map as YMap,
    transact,
    encodeStateAsUpdate,
    applyUpdate,
    snapshot,
} from 'yjs';

import {
    IndexedDBProvider,
    SQLiteProvider,
    WebsocketProvider,
} from '@toeverything/datasource/jwt-rpc';

import {
    AsyncDatabaseAdapter,
    BlockListener,
    ChangedStateKeys,
    Connectivity,
    HistoryManager,
} from '../../adapter';
import { BucketBackend, BlockItem, BlockTypes } from '../../types';
import { getLogger, sha3, sleep } from '../../utils';

import { YjsRemoteBinaries } from './binary';
import { YjsBlockInstance } from './block';
import { GateKeeper } from './gatekeeper';
import {
    YjsContentOperation,
    DO_NOT_USE_THIS_OR_YOU_WILL_BE_FIRED_SYMBOL_INTO_INNER as INTO_INNER,
} from './operation';
import { EmitEvents, Suspend } from './listener';
import { YjsHistoryManager } from './history';

declare const JWT_DEV: boolean;
const logger = getLogger('BlockDB:yjs');

type YjsProviders = {
    awareness: Awareness;
    idb: IndexedDBProvider;
    binariesIdb: IndexedDBProvider;
    fstore?: SQLiteProvider;
    ws?: WebsocketProvider;
    backend: string;
    gatekeeper: GateKeeper;
    userId: string;
    remoteToken?: string; // remote storage token
};
const _yjsDatabaseInstance = new Map<string, YjsProviders>();

async function _initWebsocketProvider(
    url: string,
    room: string,
    doc: Doc,
    token?: string,
    params?: YjsInitOptions['params']
): Promise<[Awareness, WebsocketProvider | undefined]> {
    const awareness = new Awareness(doc);

    if (token) {
        const ws = new WebsocketProvider(token, url, room, doc, {
            awareness,
            params,
        }) as any; // TODO: type is erased after cascading references

        // Wait for ws synchronization to complete, otherwise the data will be modified in reverse, which can be optimized later
        return new Promise((resolve, reject) => {
            // TODO: synced will also be triggered on reconnection after losing sync
            // There needs to be an event mechanism to emit the synchronization state to the upper layer
            ws.once('synced', () => resolve([awareness, ws]));
            ws.once('lost-connection', () => resolve([awareness, ws]));
            ws.once('connection-error', () => reject());
        });
    } else {
        return [awareness, undefined];
    }
}

const _asyncInitLoading = new Set<string>();
const _waitLoading = async (workspace: string) => {
    while (_asyncInitLoading.has(workspace)) {
        await sleep();
    }
};

async function _initYjsDatabase(
    backend: string,
    workspace: string,
    options: {
        params: YjsInitOptions['params'];
        userId: string;
        token?: string;
    }
): Promise<YjsProviders> {
    if (_asyncInitLoading.has(workspace)) {
        await _waitLoading(workspace);
    }
    const instance = _yjsDatabaseInstance.get(workspace);
    // tTODO:odo temporarily handle this
    if (
        instance &&
        (instance.userId === options.userId || options.userId === 'default')
    ) {
        return instance;
    }
    // if (instance) return instance;
    _asyncInitLoading.add(workspace);
    const { params, userId, token: remoteToken } = options;

    const doc = new Doc({ autoLoad: true, shouldLoad: true });

    const idbp = new IndexedDBProvider(workspace, doc).whenSynced;
    const fsp: SQLiteProvider | undefined = undefined; // new SQLiteProvider(workspace, doc).whenSynced;

    const wsp = _initWebsocketProvider(
        backend,
        workspace,
        doc,
        remoteToken,
        params
    );

    const [idb, [awareness, ws], fstore] = await Promise.all([idbp, wsp, fsp]);

    const binaries = new Doc({ autoLoad: true, shouldLoad: true });
    const binariesIdb = await new IndexedDBProvider(
        `${workspace}_binaries`,
        binaries
    ).whenSynced;

    const gateKeeperData = doc.getMap<YMap<string>>('gatekeeper');

    const gatekeeper = new GateKeeper(
        userId,
        gateKeeperData.get('creators') ||
            gateKeeperData.set('creators', new YMap()),
        gateKeeperData.get('common') || gateKeeperData.set('common', new YMap())
    );

    _yjsDatabaseInstance.set(workspace, {
        awareness,
        idb,
        binariesIdb,
        fstore,
        ws,
        backend,
        gatekeeper,
        userId,
        remoteToken,
    });
    _asyncInitLoading.delete(workspace);

    return {
        awareness,
        idb,
        binariesIdb,
        ws,
        backend,
        gatekeeper,
        userId,
        remoteToken,
    };
}

export type { YjsBlockInstance } from './block';
export type { YjsContentOperation } from './operation';

export type YjsInitOptions = {
    backend: typeof BucketBackend[keyof typeof BucketBackend];
    params?: Record<string, string>;
    userId?: string;
    token?: string;
};

export class YjsAdapter implements AsyncDatabaseAdapter<YjsContentOperation> {
    private readonly _provider: YjsProviders;
    private readonly _doc: Doc; // doc instance
    private readonly _awareness: Awareness; // lightweight state synchronization
    private readonly _gatekeeper: GateKeeper; // Simple access control
    private readonly _history: YjsHistoryManager;

    // Block Collection
    // key is a randomly generated global id
    private readonly _blocks: YMap<YMap<unknown>>;
    private readonly _blockUpdated: YMap<number>;
    // Maximum cache Block 1024, ttl 10 minutes
    private readonly _blockCaches: LRUCache<string, YjsBlockInstance>;

    private readonly _binaries: YjsRemoteBinaries;

    private readonly _listener: Map<string, BlockListener<any>>;

    static async init(
        workspace: string,
        options: YjsInitOptions
    ): Promise<YjsAdapter> {
        const { backend, params = {}, userId = 'default', token } = options;
        const providers = await _initYjsDatabase(backend, workspace, {
            params,
            userId,
            token,
        });
        return new YjsAdapter(providers);
    }

    private constructor(providers: YjsProviders) {
        this._provider = providers;
        this._doc = providers.idb.doc;
        this._awareness = providers.awareness;
        this._gatekeeper = providers.gatekeeper;

        const blocks = this._doc.getMap<YMap<any>>('blocks');
        this._blocks =
            blocks.get('content') || blocks.set('content', new YMap());
        this._blockUpdated =
            blocks.get('updated') || blocks.set('updated', new YMap());
        this._blockCaches = new LRUCache({ max: 1024, ttl: 1000 * 60 * 10 });
        this._binaries = new YjsRemoteBinaries(
            providers.binariesIdb.doc.getMap(),
            providers.remoteToken
        );
        this._history = new YjsHistoryManager(this._blocks);

        this._listener = new Map();

        const ws = providers.ws as any;
        if (ws) {
            const workspace = providers.idb.name;
            const emitState = (connectivity: Connectivity) => {
                this._listener.get('connectivity')?.(
                    new Map([[workspace, connectivity]])
                );
            };
            ws.on('synced', () => emitState('connected'));
            ws.on('lost-connection', () => emitState('retry'));
            ws.on('connection-error', () => emitState('retry'));
        }

        const debounced_editing_notifier = debounce(
            () => {
                const listener: BlockListener<Set<string>> | undefined =
                    this._listener.get('editing');
                if (listener) {
                    const mapping = this._awareness.getStates();
                    const editing_mapping: Record<string, string[]> = {};
                    for (const {
                        userId,
                        editing,
                        updated,
                    } of mapping.values()) {
                        // Only return the status with refresh time within 10 seconds
                        if (
                            userId &&
                            editing &&
                            updated &&
                            typeof updated === 'number' &&
                            updated + 1000 * 10 > Date.now()
                        ) {
                            if (!editing_mapping[editing])
                                editing_mapping[editing] = [];
                            editing_mapping[editing].push(userId);
                        }
                    }
                    listener(
                        new Map(
                            Object.entries(editing_mapping).map(([k, v]) => [
                                k,
                                new Set(v),
                            ])
                        )
                    );
                }
            },
            200,
            { maxWait: 1000 }
        );

        this._awareness.setLocalStateField('userId', providers.userId);

        this._awareness.on('update', debounced_editing_notifier);

        this._blocks.observeDeep(events => {
            const now = Date.now();

            const keys = events.flatMap(e => {
                if ((e.path?.length | 0) > 0) {
                    return [
                        [e.path[0], 'update'] as [string, ChangedStateKeys],
                    ];
                } else {
                    return Array.from(e.changes.keys.entries()).map(
                        ([k, { action }]) =>
                            [k, action] as [string, ChangedStateKeys]
                    );
                }
            });

            EmitEvents(keys, this._listener.get('updated'));

            transact(this._doc, () => {
                for (const [key, action] of keys) {
                    if (action === 'delete') {
                        this._blockUpdated.delete(key);
                    } else {
                        this._blockUpdated.set(key, now);
                    }
                }
            });
        });
    }

    getUserId(): string {
        return this._provider.userId;
    }

    inspector() {
        const resolve_block = (blocks: Record<string, any>, id: string) => {
            const block = blocks[id];
            if (block) {
                return {
                    ...block,
                    children: block.children.map((id: string) =>
                        resolve_block(blocks, id)
                    ),
                };
            }
        };

        return {
            save: () => {
                const binary = encodeStateAsUpdate(this._doc);
                saveAs(
                    new Blob([binary]),
                    `affine_workspace_${new Date().toDateString()}.apk`
                );
            },
            load: async () => {
                const handles = await window.showOpenFilePicker({
                    types: [
                        {
                            description: 'AFFiNE Package',
                            accept: {
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                'application/affine': ['.apk'],
                            },
                        },
                    ],
                });
                const [file] = (await fromEvent(handles)) as File[];
                const binary = await file.arrayBuffer();
                await this._provider.idb.clearData();
                const doc = new Doc({ autoLoad: true, shouldLoad: true });
                let updated = 0;
                let isUpdated = false;
                doc.on('update', () => {
                    isUpdated = true;
                    updated += 1;
                });
                setInterval(() => {
                    if (updated > 0) updated -= 1;
                }, 500);

                const update_check = new Promise<void>(resolve => {
                    const check = async () => {
                        while (!isUpdated || updated > 0) {
                            await sleep();
                        }
                        resolve();
                    };
                    check();
                });
                await new IndexedDBProvider(this._provider.idb.name, doc)
                    .whenSynced;
                applyUpdate(doc, new Uint8Array(binary));
                await update_check;
                console.log('load success');
            },
            parse: () => this._doc.toJSON(),
            // eslint-disable-next-line @typescript-eslint/naming-convention
            parse_page: (page_id: string) => {
                const blocks = this._blocks.toJSON();
                return resolve_block(blocks, page_id);
            },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            parse_pages: (resolve = false) => {
                const blocks = this._blocks.toJSON();
                return Object.fromEntries(
                    Object.entries(blocks)
                        .filter(([, block]) => block.flavor === 'page')
                        .map(([key, block]) => {
                            if (resolve) {
                                return resolve_block(blocks, key);
                            } else {
                                return [key, block];
                            }
                        })
                );
            },
            clear: () => {
                this._blocks.clear();
                this._blockUpdated.clear();
                this._gatekeeper.clear();
                this._doc.getMap('blocks').clear();
                this._doc.getMap('gatekeeper').clear();
            },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            clear_old: () => {
                this._doc.getMap('block_updated').clear();
                this._doc.getMap('blocks').clear();
                this._doc.getMap('common').clear();
                this._doc.getMap('creators').clear();
            },
            snapshot: () => {
                return snapshot(this._doc);
            },
        };
    }

    async createBlock(
        options: Pick<BlockItem<YjsContentOperation>, 'type' | 'flavor'> & {
            uuid?: string;
            binary?: ArrayBufferLike;
        }
    ): Promise<YjsBlockInstance> {
        const uuid = options.uuid || `affine${nanoid(16)}`;
        if (options.type === BlockTypes.binary) {
            if (options.binary && options.binary instanceof ArrayBuffer) {
                const array = new YArray();
                array.insert(0, [options.binary]);
                const block = {
                    type: options.type,
                    flavor: options.flavor,
                    children: [] as string[],
                    created: Date.now(),
                    content: new YjsContentOperation(array),
                    hash: sha3(Buffer.from(options.binary)),
                };
                await this.set_block(uuid, block);
                return (await this.getBlock(uuid))!;
            } else {
                throw new Error(`Invalid binary type: ${options.binary}`);
            }
        } else {
            const block = {
                type: options.type,
                flavor: options.flavor,
                children: [] as string[],
                created: Date.now(),
                content: new YjsContentOperation(new YMap()),
            };
            await this.set_block(uuid, block);
            return (await this.getBlock(uuid))!;
        }
    }

    private get_updated(id: string) {
        return this._blockUpdated.get(id);
    }

    private get_creator(id: string) {
        return this._gatekeeper.getCreator(id);
    }

    private get_block_sync(id: string): YjsBlockInstance | undefined {
        const cached = this._blockCaches.get(id);
        if (cached) {
            // Synchronous read cannot read binary
            if (cached.type === BlockTypes.block) {
                return cached;
            }
            return undefined;
        }

        const block = this._blocks.get(id);

        // Synchronous read cannot read binary
        if (block && block.get('type') === BlockTypes.block) {
            return new YjsBlockInstance({
                id,
                block,
                setBlock: this.set_block.bind(this),
                getUpdated: this.get_updated.bind(this),
                getCreator: this.get_creator.bind(this),
                getBlockInstance: this.get_block_sync.bind(this),
            });
        }

        return undefined;
    }

    async getBlock(id: string): Promise<YjsBlockInstance | undefined> {
        const block_instance = this.get_block_sync(id);
        if (block_instance) return block_instance;
        const block = this._blocks.get(id);
        if (block && block.get('type') === BlockTypes.binary) {
            const binary = await this._binaries.get(
                block.get('hash') as string
            );
            if (binary) {
                return new YjsBlockInstance({
                    id,
                    block,
                    binary,
                    setBlock: this.set_block.bind(this),
                    getUpdated: this.get_updated.bind(this),
                    getCreator: this.get_creator.bind(this),
                    getBlockInstance: this.get_block_sync.bind(this),
                });
            }
        }
        return undefined;
    }

    async getBlockByFlavor(
        flavor: BlockItem<YjsContentOperation>['flavor']
    ): Promise<string[]> {
        const keys: string[] = [];
        this._blocks.forEach((doc, key) => {
            if (doc.get('flavor') === flavor) {
                keys.push(key);
            }
        });

        return keys;
    }

    async getBlockByType(
        type: BlockItem<YjsContentOperation>['type']
    ): Promise<string[]> {
        const keys: string[] = [];
        this._blocks.forEach((doc, key) => {
            if (doc.get('type') === type) {
                keys.push(key);
            }
        });

        return keys;
    }

    private async set_block(
        key: string,
        item: BlockItem<YjsContentOperation> & { hash?: string }
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const block = this._blocks.get(key) || new YMap();
            transact(this._doc, () => {
                // Insert only if the block doesn't exist yet
                // Other modification operations are done in the block instance
                let uploaded: Promise<void> | undefined;
                if (!block.size) {
                    const content = item.content[INTO_INNER]();
                    if (!content) return reject();

                    const children = new YArray();
                    children.push(item.children);

                    block.set('type', item.type);
                    block.set('flavor', item.flavor);
                    block.set('children', children);
                    block.set('created', item.created);
                    if (item.type === BlockTypes.block) {
                        block.set('content', content);
                    } else if (item.type === BlockTypes.binary && item.hash) {
                        if (content instanceof YArray) {
                            block.set('hash', item.hash);
                            if (!this._binaries.has(item.hash)) {
                                uploaded = this._binaries.set(
                                    item.hash,
                                    content
                                );
                            }
                        } else {
                            throw new Error(
                                'binary content must be an buffer yarray'
                            );
                        }
                    } else {
                        throw new Error('invalid block type: ' + item.type);
                    }

                    this._blocks.set(key, block);
                }

                if (item.flavor === 'page') {
                    this._awareness.setLocalStateField('editing', key);
                    this._awareness.setLocalStateField('updated', Date.now());
                }
                // References do not add delete restrictions
                if (item.flavor === 'reference') {
                    this._gatekeeper.setCommon(key);
                } else {
                    this._gatekeeper.setCreator(key);
                }

                if (uploaded) {
                    // TODO: there should be a mechanism to retry the upload
                    uploaded.catch(err => {
                        // undo set on failure
                        console.error('Failed to upload object: ', err);
                        this.deleteBlocks([key]);
                        reject(err);
                    });
                }
                resolve();
            });
        });
    }

    async checkBlocks(keys: string[]): Promise<boolean> {
        return (
            keys.filter(key => !!this._blocks.get(key)).length === keys.length
        );
    }

    async deleteBlocks(keys: string[]): Promise<string[]> {
        const [success, fail] = this._gatekeeper.checkDeleteLists(keys);
        transact(this._doc, () => {
            for (const key of success) {
                this._blocks.delete(key);
            }
        });
        return fail;
    }

    on<S, R>(
        key: 'editing' | 'updated' | 'connectivity',
        listener: BlockListener<S, R>
    ): void {
        this._listener.set(key, listener);
    }

    suspend(suspend: boolean) {
        Suspend(suspend);
    }

    public history(): HistoryManager {
        return this._history;
    }
}
