/* eslint-disable max-lines */
import { createNewSortInstance } from 'fast-sort';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { Document as DocumentIndexer, DocumentSearchOptions } from 'flexsearch';
import { createStore, del, get, keys, set } from 'idb-keyval';
import produce from 'immer';
import LRUCache from 'lru-cache';
import sift, { Query } from 'sift';

import { BlockFlavors } from '../types';
import { BlockEventBus, getLogger } from '../utils';
import {
    AsyncDatabaseAdapter,
    BlockInstance,
    ChangedStates,
    ContentOperation,
} from '../yjs/types';

import { BaseBlock, IndexMetadata, QueryMetadata } from './base';

declare const JWT_DEV: boolean;

const logger = getLogger('BlockDB:indexing');
const logger_debug = getLogger('debug:BlockDB:indexing');

const naturalSort = createNewSortInstance({
    comparer: new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: 'base',
    }).compare,
});

type ChangedState = ChangedStates extends Map<unknown, infer R> ? R : never;

export type BlockMetadata = QueryMetadata & { readonly id: string };

function tokenizeZh(text: string) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const tokenizer = Intl?.['v8BreakIterator'];
    if (tokenizer) {
        const it = tokenizer(['zh-CN'], { type: 'word' });
        it.adoptText(text);
        const words = [];

        let cur = 0,
            prev = 0;

        while (cur < text.length) {
            prev = cur;
            cur = it.next();
            words.push(text.substring(prev, cur));
        }

        return words;
    }
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\x00-\x7F]/g, '').split('');
}

type IdbInstance = {
    get: (key: string) => Promise<ArrayBufferLike | undefined>;
    set: (key: string, value: ArrayBufferLike) => Promise<void>;
    keys: () => Promise<string[]>;
    delete: (key: string) => Promise<void>;
};

type BlockIdbInstance = {
    index: IdbInstance;
    metadata: IdbInstance;
};

function initIndexIdb(workspace: string): BlockIdbInstance {
    const index = createStore(`${workspace}_index`, 'index');
    const metadata = createStore(`${workspace}_metadata`, 'metadata');
    return {
        index: {
            get: (key: string) => get<ArrayBufferLike>(key, index),
            set: (key: string, value: ArrayBufferLike) =>
                set(key, value, index),
            keys: () => keys(index),
            delete: (key: string) => del(key, index),
        },
        metadata: {
            get: (key: string) => get<ArrayBufferLike>(key, metadata),
            set: (key: string, value: ArrayBufferLike) =>
                set(key, value, metadata),
            keys: () => keys(metadata),
            delete: (key: string) => del(key, metadata),
        },
    };
}

type BlockIndexedContent = {
    index: IndexMetadata;
    query: QueryMetadata;
};

export type QueryIndexMetadata = Query<QueryMetadata> & {
    $sort?: string;
    $desc?: boolean;
    $limit?: number;
};

export class BlockIndexer<
    A extends AsyncDatabaseAdapter<C>,
    B extends BlockInstance<C>,
    C extends ContentOperation
> {
    private readonly _adapter: A;
    private readonly _idb: BlockIdbInstance;

    private readonly _blockIndexer: DocumentIndexer<IndexMetadata>;
    private readonly _blockMetadata: LRUCache<string, QueryMetadata>;
    private readonly _eventBus: BlockEventBus;

    private readonly _blockBuilder: (
        block: BlockInstance<C>
    ) => Promise<BaseBlock<B, C>>;

    private readonly _delayIndex: { documents: Map<string, BaseBlock<B, C>> };

    constructor(
        adapter: A,
        workspace: string,
        block_builder: (block: BlockInstance<C>) => Promise<BaseBlock<B, C>>,
        event_bus: BlockEventBus
    ) {
        this._adapter = adapter;
        this._idb = initIndexIdb(workspace);

        this._blockIndexer = new DocumentIndexer({
            document: {
                id: 'id',
                index: ['content', 'reference'],
                tag: 'tags',
            },
            encode: tokenizeZh,
            tokenize: 'forward',
            context: true,
        });
        this._blockMetadata = new LRUCache({
            max: 10240,
            ttl: 1000 * 60 * 30,
        });

        this._blockBuilder = block_builder;
        this._eventBus = event_bus;

        this._delayIndex = { documents: new Map() };

        this._eventBus
            .topic('reindex')
            .on('reindex', this.content_reindex.bind(this), {
                debounce: { wait: 1000, maxWait: 1000 * 10 },
            });

        this._eventBus
            .topic('save_index')
            .on('save_index', this.save_index.bind(this), {
                debounce: { wait: 1000 * 10, maxWait: 1000 * 20 },
            });
    }

    private async content_reindex() {
        const paddings: Record<string, BlockIndexedContent> = {};

        this._delayIndex.documents = produce(
            this._delayIndex.documents,
            draft => {
                for (const [k, block] of draft) {
                    paddings[k] = {
                        index: block.getIndexMetadata(),
                        query: block.getQueryMetadata(),
                    };
                    draft.delete(k);
                }
            }
        );
        for (const [key, { index, query }] of Object.entries(paddings)) {
            if (index.content) {
                await this._blockIndexer.addAsync(key, index);
                this._blockMetadata.set(key, query);
            }
        }
        this._eventBus.topic('save_index').emit();
    }

    private async refresh_index(block: BaseBlock<B, C>) {
        const filter: string[] = [
            BlockFlavors.page,
            BlockFlavors.title,
            BlockFlavors.heading1,
            BlockFlavors.heading2,
            BlockFlavors.heading3,
            BlockFlavors.text,
            BlockFlavors.todo,
            BlockFlavors.reference,
        ];
        if (filter.includes(block.flavor)) {
            this._delayIndex.documents = produce(
                this._delayIndex.documents,
                draft => {
                    draft.set(block.id, block);
                }
            );

            this._eventBus.topic('reindex').emit();
            return true;
        }
        logger_debug(`skip index ${block.flavor}: ${block.id}`);
        return false;
    }

    async refreshIndex(id: string, state: ChangedState) {
        JWT_DEV && logger(`refreshArticleIndex: ${id}`);
        if (state === 'delete') {
            this._delayIndex.documents = produce(
                this._delayIndex.documents,
                draft => {
                    this._blockIndexer.remove(id);
                    this._blockMetadata.delete(id);
                    draft.delete(id);
                }
            );
            return;
        }
        const block = await this._adapter.getBlock(id);
        if (block?.id === id) {
            if (await this.refresh_index(await this._blockBuilder(block))) {
                JWT_DEV &&
                    logger(
                        state
                            ? `refresh index: ${id}, ${state}`
                            : `indexing: ${id}`
                    );
            } else {
                JWT_DEV && logger(`skip index: ${id}, ${block.flavor}`);
            }
        } else {
            JWT_DEV && logger(`refreshArticleIndex: ${id} not exists`);
        }
    }

    async loadIndex() {
        for (const key of await this._idb.index.keys()) {
            const content = await this._idb.index.get(key);
            if (content) {
                const decoded = strFromU8(inflateSync(new Uint8Array(content)));
                try {
                    await this._blockIndexer.import(key, decoded as any);
                } catch (e) {
                    console.error(`Failed to load index ${key}`, e);
                }
            }
        }
        for (const key of await this._idb.metadata.keys()) {
            const content = await this._idb.metadata.get(key);
            if (content) {
                const decoded = strFromU8(inflateSync(new Uint8Array(content)));
                try {
                    await this._blockIndexer.import(key, JSON.parse(decoded));
                } catch (e) {
                    console.error(`Failed to load index ${key}`, e);
                }
            }
        }
        return Array.from(this._blockMetadata.keys());
    }

    private async save_index() {
        const idb = this._idb;
        await idb.index
            .keys()
            .then(keys => Promise.all(keys.map(key => idb.index.delete(key))));
        await this._blockIndexer.export((key, data) => {
            return idb.index.set(
                String(key),
                deflateSync(strToU8(data as any))
            );
        });
        const metadata = this._blockMetadata;
        await idb.metadata
            .keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(key => !metadata.has(key))
                        .map(key => idb.metadata.delete(key))
                )
            );
        for (const [key, data] of metadata.entries()) {
            await idb.metadata.set(
                key,
                deflateSync(strToU8(JSON.stringify(data)))
            );
        }
    }

    public async inspectIndex() {
        const index: Record<string | number, any> = {};
        await this._blockIndexer.export((key, data) => {
            index[key] = data;
        });
    }

    public search(
        part_of_title_or_content:
            | string
            | Partial<DocumentSearchOptions<boolean>>
    ) {
        return this._blockIndexer.search(part_of_title_or_content as string);
    }

    private _testMetaKey(key: string) {
        try {
            const metadata = this._blockMetadata.values().next().value;
            if (!metadata || typeof metadata !== 'object') {
                return false;
            }
            return !!(key in metadata);
        } catch (e) {
            return false;
        }
    }

    private _getSortedMetadata(sort: string, desc?: boolean) {
        const sorter = naturalSort(Array.from(this._blockMetadata.entries()));
        if (desc) {
            return sorter.desc(([, m]) => m[sort]);
        } else {
            return sorter.asc(([, m]) => m[sort]);
        }
    }

    public query(query: QueryIndexMetadata) {
        const matches: string[] = [];
        const { $sort, $desc, $limit, ...condition } = query;
        const filter = sift<QueryMetadata>(condition);
        const limit = $limit || this._blockMetadata.size;

        if ($sort && this._testMetaKey($sort)) {
            const metadata = this._getSortedMetadata($sort, $desc);
            metadata.forEach(([key, value]) => {
                if (matches.length > limit) {
                    return;
                }
                if (filter(value)) {
                    matches.push(key);
                }
            });

            return matches;
        } else {
            this._blockMetadata.forEach((value, key) => {
                if (matches.length > limit) {
                    return;
                }
                if (filter(value)) {
                    matches.push(key);
                }
            });

            return matches;
        }
    }

    public getMetadata(ids: string[]): Array<BlockMetadata> {
        return ids
            .filter(id => this._blockMetadata.has(id))
            .map(id => ({ ...this._blockMetadata.get(id)!, id }));
    }
}
