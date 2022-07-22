/* eslint-disable max-lines */
import { DocumentSearchOptions } from 'flexsearch';
import LRUCache from 'lru-cache';

import {
    AsyncDatabaseAdapter,
    YjsAdapter,
    YjsInitOptions,
    YjsContentOperation,
    ChangedStates,
    BlockListener,
    BlockInstance,
    ContentOperation,
    HistoryManager,
    ContentTypes,
} from './adapter';
import { YjsBlockInstance } from './adapter/yjs';
import {
    BaseBlock,
    BlockIndexer,
    BlockSearchItem,
    ReadableContentExporter,
} from './block';
import { QueryIndexMetadata } from './block/indexer';
import {
    BlockTypes,
    BlockTypeKeys,
    BlockFlavors,
    BucketBackend,
    UUID,
    BlockFlavorKeys,
    BlockItem,
    ExcludeFunction,
} from './types';
import { BlockEventBus, genUUID, getLogger } from './utils';

declare const JWT_DEV: boolean;

const logger = getLogger('BlockDB:client');
// const logger_debug = getLogger('debug:BlockDB:client');

const namedUuid = Symbol('namedUUID');

type BlockUuid<T extends string> = T extends UUID<T> ? T : never;
type BlockUuidOrType<T extends string> = T extends
    | BlockTypeKeys
    | BlockFlavorKeys
    ? T
    : T extends string
    ? BlockUuid<T>
    : never;

type BlockInstanceValue = ExcludeFunction<BlockInstance<any>>;
export type BlockMatcher = Partial<BlockInstanceValue>;

type BlockExporters<R> = Map<
    string,
    [BlockMatcher, ReadableContentExporter<R, any>]
>;
type BlockClientOptions = {
    content?: BlockExporters<string>;
    metadata?: BlockExporters<Array<[string, number | string | string[]]>>;
    tagger?: BlockExporters<string[]>;
};

export class BlockClient<
    A extends AsyncDatabaseAdapter<C>,
    B extends BlockInstance<C>,
    C extends ContentOperation
> {
    readonly #adapter: A;
    readonly #workspace: string;

    // Maximum cache Block 8192, ttl 30 minutes
    readonly #block_caches: LRUCache<string, BaseBlock<B, C>>;
    readonly #block_indexer: BlockIndexer<A, B, C>;

    readonly #exporters: {
        readonly content: BlockExporters<string>;
        readonly metadata: BlockExporters<
            Array<[string, number | string | string[]]>
        >;
        readonly tag: BlockExporters<string[]>;
    };

    readonly #event_bus: BlockEventBus;

    readonly #parent_mapping: Map<string, string[]>;
    readonly #page_mapping: Map<string, string>;

    readonly #root: { node?: BaseBlock<B, C> };

    private constructor(
        adapter: A,
        workspace: string,
        options?: BlockClientOptions
    ) {
        this.#adapter = adapter;
        this.#workspace = workspace;

        this.#block_caches = new LRUCache({ max: 8192, ttl: 1000 * 60 * 30 });

        this.#exporters = {
            content: options?.content || new Map(),
            metadata: options?.metadata || new Map(),
            tag: options?.tagger || new Map(),
        };

        this.#event_bus = new BlockEventBus();

        this.#block_indexer = new BlockIndexer(
            this.#adapter,
            this.#workspace,
            this.block_builder.bind(this),
            this.#event_bus.topic('indexer')
        );

        this.#parent_mapping = new Map();
        this.#page_mapping = new Map();
        this.#adapter.on('editing', (states: ChangedStates) =>
            this.#event_bus.topic('editing').emit(states)
        );
        this.#adapter.on('updated', (states: ChangedStates) =>
            this.#event_bus.topic('updated').emit(states)
        );

        this.#event_bus
            .topic<string[]>('rebuild_index')
            .on('rebuild_index', this.rebuild_index.bind(this), {
                debounce: { wait: 1000, maxWait: 1000 },
            });

        this.#root = {};
    }

    public addBlockListener(tag: string, listener: BlockListener) {
        const bus = this.#event_bus.topic<ChangedStates>('updated');
        if (tag !== 'index' || !bus.has(tag)) bus.on(tag, listener);
        else console.error(`block listener ${tag} is reserved`);
    }

    public removeBlockListener(tag: string) {
        this.#event_bus.topic('updated').off(tag);
    }

    public addEditingListener(
        tag: string,
        listener: BlockListener<Set<string>>
    ) {
        const bus =
            this.#event_bus.topic<ChangedStates<Set<string>>>('editing');
        if (tag !== 'index' || !bus.has(tag)) bus.on(tag, listener);
        else console.error(`editing listener ${tag} is reserved`);
    }

    public removeEditingListener(tag: string) {
        this.#event_bus.topic('editing').off(tag);
    }

    private inspector() {
        return {
            ...this.#adapter.inspector(),
            indexed: () => this.#block_indexer.inspectIndex(),
        };
    }

    private async rebuild_index(exists_ids?: string[]) {
        JWT_DEV && logger(`rebuild index`);
        const blocks = await this.#adapter.getBlockByType(BlockTypes.block);
        const excluded = exists_ids || [];
        await Promise.all(
            blocks
                .filter(id => !excluded.includes(id))
                .map(id => this.#block_indexer.refreshIndex(id, 'add'))
        );
    }

    public async buildIndex() {
        JWT_DEV && logger(`buildIndex: start`);
        // Skip the block index that exists in the metadata, assuming that the index of the block existing in the metadata is the latest, and modify this part if there is a problem
        // Although there may be cases where the index is refreshed but the metadata is not refreshed, re-indexing will be automatically triggered after the block is changed
        const exists_ids = await this.#block_indexer.loadIndex();
        await this.rebuild_index(exists_ids);
        this.addBlockListener('index', async states => {
            await Promise.allSettled(
                Array.from(states.entries()).map(([id, state]) => {
                    if (state === 'delete') this.#block_caches.delete(id);
                    return this.#block_indexer.refreshIndex(id, state);
                })
            );
        });
    }

    /**
     * Get a specific type of block, currently only the article type is supported
     * @param block_type block type
     * @returns
     */
    public async getByType(
        block_type: BlockTypeKeys | BlockFlavorKeys
    ): Promise<Map<string, BaseBlock<B, C>>> {
        JWT_DEV && logger(`getByType: ${block_type}`);
        const ids = [
            ...this.#block_indexer.query({
                type: BlockTypes[block_type as BlockTypeKeys],
            }),
            ...this.#block_indexer.query({
                flavor: BlockFlavors[block_type as BlockFlavorKeys],
            }),
        ];
        const docs = await Promise.all(
            ids.map(id =>
                this.get(id as BlockUuidOrType<typeof id>).then(
                    doc => [id, doc] as const
                )
            )
        );
        return new Map(docs.filter(([, doc]) => doc.children.length));
    }

    /**
     * research all
     * @param part_of_title_or_content Title or content keyword, support Chinese
     * @param part_of_title_or_content.index search range, optional values: title, ttl, content, reference
     * @param part_of_title_or_content.tag tag, string or array of strings, supports multiple tags
     * @param part_of_title_or_content.query keyword, support Chinese
     * @param part_of_title_or_content.limit The limit of the number of search results, the default is 100
     * @param part_of_title_or_content.offset search result offset, used for page turning, default is 0
     * @param part_of_title_or_content.suggest Fuzzy matching, after enabling the content including some keywords can also be searched, the default is false
     * @returns array of search results, each array is a list of attributed block ids
     */
    public search(
        part_of_title_or_content:
            | string
            | Partial<DocumentSearchOptions<boolean>>
    ) {
        return this.#block_indexer.search(part_of_title_or_content);
    }

    /**
     * Full text search, the returned results are grouped by page dimension
     * @param part_of_title_or_content Title or content keyword, support Chinese
     * @param part_of_title_or_content.index search range, optional values: title, ttl, content, reference
     * @param part_of_title_or_content.tag tag, string or array of strings, supports multiple tags
     * @param part_of_title_or_content.query keyword, support Chinese
     * @param part_of_title_or_content.limit The limit of the number of search results, the default is 100
     * @param part_of_title_or_content.offset search result offset, used for page turning, default is 0
     * @param part_of_title_or_content.suggest Fuzzy matching, after enabling the content including some keywords can also be searched, the default is false
     * @returns array of search results, each array is a page
     */
    public async searchPages(
        part_of_title_or_content:
            | string
            | Partial<DocumentSearchOptions<boolean>>
    ): Promise<BlockSearchItem[]> {
        const promised_pages = await Promise.all(
            this.search(part_of_title_or_content).flatMap(({ result }) =>
                result.map(async id => {
                    const page = this.#page_mapping.get(id as string);
                    if (page) return page;
                    const block = await this.get(id as BlockTypeKeys);
                    return this.set_page(block);
                })
            )
        );
        const pages = [
            ...new Set(promised_pages.filter((v): v is string => !!v)),
        ];
        return Promise.all(
            this.#block_indexer.getMetadata(pages).map(async page => ({
                content: this.get_decoded_content(
                    await this.#adapter.getBlock(page.id)
                ),
                ...page,
            }))
        );
    }

    /**
     * Inquire
     * @returns array of search results
     */
    public query(query: QueryIndexMetadata): string[] {
        return this.#block_indexer.query(query);
    }

    /**
     * Get a fixed name, which has the same UUID in each workspace, and is automatically created when it does not exist
     * Generally used to store workspace-level global configuration
     * @param name block name
     * @returns block instance
     */
    private async get_named_block(
        name: string,
        options?: { workspace?: boolean }
    ): Promise<BaseBlock<B, C>> {
        const block = await this.get(genUUID(name), {
            flavor: options?.workspace
                ? BlockFlavors.workspace
                : BlockFlavors.page,
            [namedUuid]: true,
        });
        return block;
    }

    /**
     * Get the workspace block of the current instance
     * @returns block instance
     */
    public async getWorkspace() {
        if (!this.#root.node) {
            this.#root.node = await this.get_named_block(this.#workspace, {
                workspace: true,
            });
        }
        return this.#root.node;
    }

    /**
     * @deprecated custom data including access to ws configuration is unified through baseBlock.get/setDecoration(key).
     * - Get the config of the workspace block of the current instance
     * @returns MapOperation
     */
    public async getWorkspaceConfig<T = unknown>() {
        return (await this.getWorkspace()).getContent<T>();
    }

    private async get_parent(id: string) {
        const parents = this.#parent_mapping.get(id);
        if (parents) {
            const parent_block_id = parents[0];
            if (!this.#block_caches.has(parent_block_id)) {
                this.#block_caches.set(
                    parent_block_id,
                    await this.get(parent_block_id as BlockTypeKeys)
                );
            }
            return this.#block_caches.get(parent_block_id);
        }
        return undefined;
    }

    private set_parent(parent: string, child: string) {
        const parents = this.#parent_mapping.get(child);
        if (parents?.length) {
            if (!parents.includes(parent)) {
                console.error('parent already exists', child, parents);
                this.#parent_mapping.set(child, [...parents, parent]);
            }
        } else {
            this.#parent_mapping.set(child, [parent]);
        }
    }

    private set_page(block: BaseBlock<B, C>) {
        const page = this.#page_mapping.get(block.id);
        if (page) return page;
        const parent_page = block.parent_page;
        if (parent_page) {
            this.#page_mapping.set(block.id, parent_page);
            return parent_page;
        }
        return undefined;
    }

    registerContentExporter<T extends ContentTypes>(
        name: string,
        matcher: BlockMatcher,
        exporter: ReadableContentExporter<string, T>
    ) {
        this.#exporters.content.set(name, [matcher, exporter]);
        this.#event_bus.topic('rebuild_index').emit(); // // rebuild the index every time the content exporter is registered
    }

    unregisterContentExporter(name: string) {
        this.#exporters.content.delete(name);
        this.#event_bus.topic('rebuild_index').emit(); // Rebuild indexes every time content exporter logs out
    }

    registerMetadataExporter<T extends ContentTypes>(
        name: string,
        matcher: BlockMatcher,
        exporter: ReadableContentExporter<
            Array<[string, number | string | string[]]>,
            T
        >
    ) {
        this.#exporters.metadata.set(name, [matcher, exporter]);
        this.#event_bus.topic('rebuild_index').emit(); // // rebuild the index every time the content exporter is registered
    }

    unregisterMetadataExporter(name: string) {
        this.#exporters.metadata.delete(name);
        this.#event_bus.topic('rebuild_index').emit(); // Rebuild indexes every time content exporter logs out
    }

    registerTagExporter<T extends ContentTypes>(
        name: string,
        matcher: BlockMatcher,
        exporter: ReadableContentExporter<string[], T>
    ) {
        this.#exporters.tag.set(name, [matcher, exporter]);
        this.#event_bus.topic('rebuild_index').emit(); // Reindex every tag exporter registration
    }

    unregisterTagExporter(name: string) {
        this.#exporters.tag.delete(name);
        this.#event_bus.topic('rebuild_index').emit(); // Reindex every time tag exporter logs out
    }

    private get_exporters<R>(
        exporter_map: BlockExporters<R>,
        block: BlockInstance<C>
    ): Readonly<[string, ReadableContentExporter<R, any>]>[] {
        const exporters = [];
        for (const [name, [cond, exporter]] of exporter_map) {
            const conditions = Object.entries(cond);
            let matched = 0;
            for (const [key, value] of conditions) {
                if (block[key as keyof BlockInstanceValue] === value) {
                    matched += 1;
                }
            }
            if (matched === conditions.length)
                exporters.push([name, exporter] as const);
        }

        return exporters;
    }

    private get_decoded_content(block?: BlockInstance<C>) {
        if (block) {
            const [exporter] = this.get_exporters(
                this.#exporters.content,
                block
            );
            if (exporter) {
                const op = block.content.asMap();
                if (op) return exporter[1](op);
            }
        }
        return undefined;
    }

    private async block_builder(
        block: BlockInstance<C>,
        root?: BaseBlock<B, C>
    ) {
        return new BaseBlock(
            block,
            root,
            (await this.get_parent(block.id)) || root,
            {
                content: block =>
                    this.get_exporters(this.#exporters.content, block),
                metadata: block =>
                    this.get_exporters(this.#exporters.metadata, block),
                tag: block => this.get_exporters(this.#exporters.tag, block),
            }
        );
    }

    /**
     * Get a Block, which is automatically created if it does not exist
     * @param block_id_or_type block id, create a new text block when BlockTypes/BlockFlavors are not provided, does not exist or is provided. If BlockTypes/BlockFlavors are provided, create a block of the corresponding type
     * @param options.type The type of block created when block does not exist, the default is block
     * @param options.flavor The flavor of the block created when the block does not exist, the default is text
     * @param options.binary content of binary block, must be provided when type or block_id_or_type is binary
     * @returns block instance
     */
    public async get<S extends string>(
        block_id_or_type?: BlockUuidOrType<S>,
        options?: {
            type?: BlockItem<C>['type'];
            flavor: BlockItem<C>['flavor'];
            binary?: ArrayBuffer;
            [namedUuid]?: boolean;
        }
    ): Promise<BaseBlock<B, C>> {
        JWT_DEV && logger(`get: ${block_id_or_type}`);
        const {
            type = BlockTypes.block,
            flavor = BlockFlavors.text,
            binary,
            [namedUuid]: is_named_uuid,
        } = options || {};
        if (block_id_or_type && this.#block_caches.has(block_id_or_type)) {
            return this.#block_caches.get(block_id_or_type) as BaseBlock<B, C>;
        } else {
            const block =
                (block_id_or_type &&
                    (await this.#adapter.getBlock(block_id_or_type))) ||
                (await this.#adapter.createBlock({
                    uuid: is_named_uuid ? block_id_or_type : undefined,
                    binary,
                    type:
                        block_id_or_type &&
                        BlockTypes[block_id_or_type as BlockTypeKeys]
                            ? BlockTypes[block_id_or_type as BlockTypeKeys]
                            : type,
                    flavor:
                        block_id_or_type &&
                        BlockFlavors[block_id_or_type as BlockFlavorKeys]
                            ? BlockFlavors[block_id_or_type as BlockFlavorKeys]
                            : flavor,
                }));

            const root = is_named_uuid ? undefined : await this.getWorkspace();

            for (const child of block.children) {
                this.set_parent(block.id, child);
            }

            const abstract_block = await this.block_builder(block, root);
            this.set_page(abstract_block);
            abstract_block.on('parent', 'client_hook', state => {
                const [parent] = state.keys();
                this.set_parent(parent, abstract_block.id);
                this.set_page(abstract_block);
            });
            this.#block_caches.set(abstract_block.id, abstract_block);
            return abstract_block;
        }
    }

    public async getBlockByFlavor(
        flavor: BlockItem<C>['flavor']
    ): Promise<string[]> {
        return await this.#adapter.getBlockByFlavor(flavor);
    }

    public getUserId(): string {
        return this.#adapter.getUserId();
    }

    public has(block_ids: string[]): Promise<boolean> {
        return this.#adapter.checkBlocks(block_ids);
    }

    /**
     * Suspend instant update event dispatch, extend to a maximum of 500ms once, and a maximum of 2000ms when triggered continuously
     * @param suspend true: suspend monitoring, false: resume monitoring
     */
    suspend(suspend: boolean) {
        this.#adapter.suspend(suspend);
    }

    public get history(): HistoryManager {
        return this.#adapter.history();
    }

    public static async init(
        workspace: string,
        options: Partial<YjsInitOptions & BlockClientOptions> = {}
    ): Promise<BlockClientInstance> {
        const instance = await YjsAdapter.init(workspace, {
            backend: BucketBackend.YjsWebSocketAffine,
            ...options,
        });
        return new BlockClient(instance, workspace, options);
    }
}

export type BlockImplInstance = BaseBlock<
    YjsBlockInstance,
    YjsContentOperation
>;
export type BlockClientInstance = BlockClient<
    YjsAdapter,
    YjsBlockInstance,
    YjsContentOperation
>;

export type BlockInitOptions = NonNullable<
    Parameters<typeof BlockClient.init>[1]
>;

export type {
    TextOperation,
    ArrayOperation,
    MapOperation,
    ChangedStates,
} from './adapter';
export type {
    BlockSearchItem,
    Decoration as BlockDecoration,
    ReadableContentExporter as BlockContentExporter,
} from './block';
export type { BlockTypeKeys } from './types';
export { BlockTypes, BucketBackend as BlockBackend } from './types';
export { isBlock } from './utils';
export type { QueryIndexMetadata };
