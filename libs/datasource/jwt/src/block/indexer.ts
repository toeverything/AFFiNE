import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { Document as DocumentIndexer, DocumentSearchOptions } from 'flexsearch';
import { get, set, keys, del, createStore } from 'idb-keyval';
import produce from 'immer';
import LRUCache from 'lru-cache';
import sift, { Query } from 'sift';

import {
    AsyncDatabaseAdapter,
    BlockInstance,
    ChangedStates,
    ContentOperation,
} from '../adapter';
import { BlockFlavors } from '../types';
import { BlockEventBus, getLogger } from '../utils';

import { BaseBlock, IndexMetadata, QueryMetadata } from './base';

declare const JWT_DEV: boolean;

const logger = getLogger('BlockDB:indexing');
const logger_debug = getLogger('debug:BlockDB:indexing');

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

export type QueryIndexMetadata = Query<QueryMetadata>;

export class BlockIndexer<
    A extends AsyncDatabaseAdapter<C>,
    B extends BlockInstance<C>,
    C extends ContentOperation
> {
    readonly #adapter: A;
    readonly #idb: BlockIdbInstance;

    readonly #block_indexer: DocumentIndexer<IndexMetadata>;
    readonly #block_metadata: LRUCache<string, QueryMetadata>;
    readonly #event_bus: BlockEventBus;

    readonly #block_builder: (
        block: BlockInstance<C>
    ) => Promise<BaseBlock<B, C>>;

    readonly #delay_index: { documents: Map<string, BaseBlock<B, C>> };

    constructor(
        adapter: A,
        workspace: string,
        block_builder: (block: BlockInstance<C>) => Promise<BaseBlock<B, C>>,
        event_bus: BlockEventBus
    ) {
        this.#adapter = adapter;
        this.#idb = initIndexIdb(workspace);

        this.#block_indexer = new DocumentIndexer({
            document: {
                id: 'id',
                index: ['content', 'reference'],
                tag: 'tags',
            },
            encode: tokenizeZh,
            tokenize: 'forward',
            context: true,
        });
        this.#block_metadata = new LRUCache({
            max: 10240,
            ttl: 1000 * 60 * 30,
        });

        this.#block_builder = block_builder;
        this.#event_bus = event_bus;

        this.#delay_index = { documents: new Map() };

        this.#event_bus
            .topic('reindex')
            .on('reindex', this.content_reindex.bind(this), {
                debounce: { wait: 1000, maxWait: 1000 * 10 },
            });

        this.#event_bus
            .topic('save_index')
            .on('save_index', this.save_index.bind(this), {
                debounce: { wait: 1000 * 10, maxWait: 1000 * 20 },
            });
    }

    private async content_reindex() {
        const paddings: Record<string, BlockIndexedContent> = {};

        this.#delay_index.documents = produce(
            this.#delay_index.documents,
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
                await this.#block_indexer.addAsync(key, index);
                this.#block_metadata.set(key, query);
            }
        }
        this.#event_bus.topic('save_index').emit();
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
            this.#delay_index.documents = produce(
                this.#delay_index.documents,
                draft => {
                    draft.set(block.id, block);
                }
            );

            this.#event_bus.topic('reindex').emit();
            return true;
        }
        logger_debug(`skip index ${block.flavor}: ${block.id}`);
        return false;
    }

    async refreshIndex(id: string, state: ChangedState) {
        JWT_DEV && logger(`refreshArticleIndex: ${id}`);
        if (state === 'delete') {
            this.#delay_index.documents = produce(
                this.#delay_index.documents,
                draft => {
                    this.#block_indexer.remove(id);
                    this.#block_metadata.delete(id);
                    draft.delete(id);
                }
            );
            return;
        }
        const block = await this.#adapter.getBlock(id);
        if (block?.id === id) {
            if (await this.refresh_index(await this.#block_builder(block))) {
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
        for (const key of await this.#idb.index.keys()) {
            const content = await this.#idb.index.get(key);
            if (content) {
                const decoded = strFromU8(inflateSync(new Uint8Array(content)));
                try {
                    await this.#block_indexer.import(key, decoded as any);
                } catch (e) {
                    console.error(`Failed to load index ${key}`, e);
                }
            }
        }
        for (const key of await this.#idb.metadata.keys()) {
            const content = await this.#idb.metadata.get(key);
            if (content) {
                const decoded = strFromU8(inflateSync(new Uint8Array(content)));
                try {
                    await this.#block_indexer.import(key, JSON.parse(decoded));
                } catch (e) {
                    console.error(`Failed to load index ${key}`, e);
                }
            }
        }
        return Array.from(this.#block_metadata.keys());
    }

    private async save_index() {
        const idb = this.#idb;
        await idb.index
            .keys()
            .then(keys => Promise.all(keys.map(key => idb.index.delete(key))));
        await this.#block_indexer.export((key, data) => {
            return idb.index.set(
                String(key),
                deflateSync(strToU8(data as any))
            );
        });
        const metadata = this.#block_metadata;
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
        await this.#block_indexer.export((key, data) => {
            index[key] = data;
        });
    }

    public search(
        part_of_title_or_content:
            | string
            | Partial<DocumentSearchOptions<boolean>>
    ) {
        return this.#block_indexer.search(part_of_title_or_content as string);
    }

    public query(query: QueryIndexMetadata) {
        const matches: string[] = [];
        const filter = sift<QueryMetadata>(query);
        this.#block_metadata.forEach((value, key) => {
            if (filter(value)) matches.push(key);
        });
        return matches;
    }

    public getMetadata(ids: string[]): Array<BlockMetadata> {
        return ids
            .filter(id => this.#block_metadata.has(id))
            .map(id => ({ ...this.#block_metadata.get(id)!, id }));
    }
}
