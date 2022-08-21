/* eslint-disable max-lines */
import { DocumentSearchOptions } from 'flexsearch';
import LRUCache from 'lru-cache';
import {
    AsyncDatabaseAdapter,
    BlockInstance,
    BlockListener,
    ChangedStates,
    Connectivity,
    ContentOperation,
    ContentTypes,
    DataExporter,
    getDataExporter,
    HistoryManager,
    YjsAdapter,
    YjsContentOperation,
    YjsInitOptions,
} from './adapter';
import {
    getYjsProviders,
    YjsBlockInstance,
    YjsProviderOptions,
} from './adapter/yjs';
import {
    BaseBlock,
    BlockIndexer,
    BlockSearchItem,
    ReadableContentExporter,
} from './block';
import { QueryIndexMetadata } from './block/indexer';
import {
    BlockFlavorKeys,
    BlockFlavors,
    BlockItem,
    BlockTypeKeys,
    BlockTypes,
    BucketBackend,
    ExcludeFunction,
    UUID,
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
    installExporter: (
        initialData: Uint8Array,
        exporter: DataExporter
    ) => Promise<void>;
};

export class BlockClient<
    A extends AsyncDatabaseAdapter<C>,
    B extends BlockInstance<C>,
    C extends ContentOperation
> {
    private readonly _adapter: A;
    private readonly _workspace: string;

    // Maximum cache Block 8192, ttl 30 minutes
    private readonly _blockCaches: LRUCache<string, BaseBlock<B, C>>;
    private readonly _blockIndexer: BlockIndexer<A, B, C>;

    private readonly _exporters: {
        readonly content: BlockExporters<string>;
        readonly metadata: BlockExporters<
            Array<[string, number | string | string[]]>
        >;
        readonly tag: BlockExporters<string[]>;
    };

    private readonly _eventBus: BlockEventBus;

    private readonly _parentMapping: Map<string, string[]>;
    private readonly _pageMapping: Map<string, string>;

    private readonly _root: { node?: BaseBlock<B, C> };

    private readonly _installExporter: (
        initialData: Uint8Array,
        exporter: DataExporter
    ) => Promise<void>;

    private constructor(
        adapter: A,
        workspace: string,
        options: BlockClientOptions
    ) {
        this._adapter = adapter;
        this._workspace = workspace;

        this._blockCaches = new LRUCache({ max: 8192, ttl: 1000 * 60 * 30 });

        this._exporters = {
            content: options?.content || new Map(),
            metadata: options?.metadata || new Map(),
            tag: options?.tagger || new Map(),
        };

        this._eventBus = new BlockEventBus();

        this._blockIndexer = new BlockIndexer(
            this._adapter,
            this._workspace,
            this.block_builder.bind(this),
            this._eventBus.topic('indexer')
        );

        this._parentMapping = new Map();
        this._pageMapping = new Map();
        this._adapter.on('editing', (states: ChangedStates) =>
            this._eventBus.topic('editing').emit(states)
        );
        this._adapter.on('updated', (states: ChangedStates) =>
            this._eventBus.topic('updated').emit(states)
        );

        this._adapter.on(
            'connectivity',
            (states: ChangedStates<Connectivity>) =>
                this._eventBus.topic('connectivity').emit(states)
        );

        this._eventBus
            .topic<string[]>('rebuild_index')
            .on('rebuild_index', this.rebuild_index.bind(this), {
                debounce: { wait: 1000, maxWait: 1000 },
            });

        this._root = {};
        this._installExporter = options.installExporter;
    }

    public addBlockListener(tag: string, listener: BlockListener) {
        const bus = this._eventBus.topic<ChangedStates>('updated');
        if (tag !== 'index' || !bus.has(tag)) bus.on(tag, listener);
        else console.error(`block listener ${tag} is reserved or exists`);
    }

    public removeBlockListener(tag: string) {
        this._eventBus.topic('updated').off(tag);
    }

    public addEditingListener(
        tag: string,
        listener: BlockListener<Set<string>>
    ) {
        const bus = this._eventBus.topic<ChangedStates<Set<string>>>('editing');
        if (tag !== 'index' || !bus.has(tag)) bus.on(tag, listener);
        else console.error(`editing listener ${tag} is reserved or exists`);
    }

    public removeEditingListener(tag: string) {
        this._eventBus.topic('editing').off(tag);
    }

    public addConnectivityListener(
        tag: string,
        listener: BlockListener<Connectivity>
    ) {
        const bus =
            this._eventBus.topic<ChangedStates<Connectivity>>('connectivity');
        if (tag !== 'index' || !bus.has(tag)) bus.on(tag, listener);
        else
            console.error(`connectivity listener ${tag} is reserved or exists`);
    }

    public removeConnectivityListener(tag: string) {
        this._eventBus.topic('connectivity').off(tag);
    }

    private inspector() {
        return {
            ...this._adapter.inspector(),
            indexed: () => this._blockIndexer.inspectIndex(),
        };
    }

    private async rebuild_index(exists_ids?: string[]) {
        JWT_DEV && logger(`rebuild index`);
        const blocks = await this._adapter.getBlockByType(BlockTypes.block);
        const excluded = exists_ids || [];
        await Promise.all(
            blocks
                .filter(id => !excluded.includes(id))
                .map(id => this._blockIndexer.refreshIndex(id, 'add'))
        );
    }

    public async buildIndex() {
        JWT_DEV && logger(`buildIndex: start`);
        // Skip the block index that exists in the metadata, assuming that the index of the block existing in the metadata is the latest, and modify this part if there is a problem
        // Although there may be cases where the index is refreshed but the metadata is not refreshed, re-indexing will be automatically triggered after the block is changed
        const exists_ids = await this._blockIndexer.loadIndex();
        await this.rebuild_index(exists_ids);
        this.addBlockListener('index', async states => {
            await Promise.allSettled(
                Array.from(states.entries()).map(([id, state]) => {
                    if (state === 'delete') this._blockCaches.delete(id);
                    return this._blockIndexer.refreshIndex(id, state);
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
            ...this._blockIndexer.query({
                type: BlockTypes[block_type as BlockTypeKeys],
            }),
            ...this._blockIndexer.query({
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
        return this._blockIndexer.search(part_of_title_or_content);
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
        let pages = [];
        if (part_of_title_or_content) {
            const promisedPages = await Promise.all(
                this.search(part_of_title_or_content).flatMap(({ result }) =>
                    result.map(async id => {
                        const page = this._pageMapping.get(id as string);
                        if (page) return page;
                        const block = await this.get(id as BlockTypeKeys);
                        return this.set_page(block);
                    })
                )
            );
            pages = [...new Set(promisedPages.filter((v): v is string => !!v))];
        } else {
            pages = await this.getBlockByFlavor('page');
        }
        return Promise.all(
            this._blockIndexer.getMetadata(pages).map(async page => ({
                content: this.get_decoded_content(
                    await this._adapter.getBlock(page.id)
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
        return this._blockIndexer.query(query);
    }

    public queryBlocks(query: QueryIndexMetadata): Promise<BlockSearchItem[]> {
        const ids = this.query(query);
        return Promise.all(
            this._blockIndexer.getMetadata(ids).map(async page => ({
                content: this.get_decoded_content(
                    await this._adapter.getBlock(page.id)
                ),
                ...page,
            }))
        );
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
        if (!this._root.node) {
            this._root.node = await this.get_named_block(this._workspace, {
                workspace: true,
            });
        }
        return this._root.node;
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
        const parents = this._parentMapping.get(id);
        if (parents) {
            const parent_block_id = parents[0];
            if (!this._blockCaches.has(parent_block_id)) {
                this._blockCaches.set(
                    parent_block_id,
                    await this.get(parent_block_id as BlockTypeKeys)
                );
            }
            return this._blockCaches.get(parent_block_id);
        }
        return undefined;
    }

    private set_parent(parent: string, child: string) {
        const parents = this._parentMapping.get(child);
        if (parents?.length) {
            if (!parents.includes(parent)) {
                console.error('parent already exists', child, parents);
                this._parentMapping.set(child, [...parents, parent]);
            }
        } else {
            this._parentMapping.set(child, [parent]);
        }
    }

    private set_page(block: BaseBlock<B, C>) {
        const page = this._pageMapping.get(block.id);
        if (page) return page;
        const parent_page = block.parent_page;
        if (parent_page) {
            this._pageMapping.set(block.id, parent_page);
            return parent_page;
        }
        return undefined;
    }

    registerContentExporter<T extends ContentTypes>(
        name: string,
        matcher: BlockMatcher,
        exporter: ReadableContentExporter<string, T>
    ) {
        this._exporters.content.set(name, [matcher, exporter]);
        this._eventBus.topic('rebuild_index').emit(); // // rebuild the index every time the content exporter is registered
    }

    unregisterContentExporter(name: string) {
        this._exporters.content.delete(name);
        this._eventBus.topic('rebuild_index').emit(); // Rebuild indexes every time content exporter logs out
    }

    registerMetadataExporter<T extends ContentTypes>(
        name: string,
        matcher: BlockMatcher,
        exporter: ReadableContentExporter<
            Array<[string, number | string | string[]]>,
            T
        >
    ) {
        this._exporters.metadata.set(name, [matcher, exporter]);
        this._eventBus.topic('rebuild_index').emit(); // // rebuild the index every time the content exporter is registered
    }

    unregisterMetadataExporter(name: string) {
        this._exporters.metadata.delete(name);
        this._eventBus.topic('rebuild_index').emit(); // Rebuild indexes every time content exporter logs out
    }

    registerTagExporter<T extends ContentTypes>(
        name: string,
        matcher: BlockMatcher,
        exporter: ReadableContentExporter<string[], T>
    ) {
        this._exporters.tag.set(name, [matcher, exporter]);
        this._eventBus.topic('rebuild_index').emit(); // Reindex every tag exporter registration
    }

    unregisterTagExporter(name: string) {
        this._exporters.tag.delete(name);
        this._eventBus.topic('rebuild_index').emit(); // Reindex every time tag exporter logs out
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
                this._exporters.content,
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
                    this.get_exporters(this._exporters.content, block),
                metadata: block =>
                    this.get_exporters(this._exporters.metadata, block),
                tag: block => this.get_exporters(this._exporters.tag, block),
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
        if (block_id_or_type && this._blockCaches.has(block_id_or_type)) {
            return this._blockCaches.get(block_id_or_type) as BaseBlock<B, C>;
        } else {
            const block =
                (block_id_or_type &&
                    (await this._adapter.getBlock(block_id_or_type))) ||
                (await this._adapter.createBlock({
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
            this._blockCaches.set(abstract_block.id, abstract_block);

            if (root && abstract_block.flavor === BlockFlavors.page) {
                root.insertChildren(abstract_block);
            }
            return abstract_block;
        }
    }

    public async getBlockByFlavor(
        flavor: BlockItem<C>['flavor']
    ): Promise<string[]> {
        return await this._adapter.getBlockByFlavor(flavor);
    }

    public getUserId(): string {
        return this._adapter.getUserId();
    }

    public has(block_ids: string[]): Promise<boolean> {
        return this._adapter.checkBlocks(block_ids);
    }

    /**
     * Suspend instant update event dispatch, extend to a maximum of 500ms once, and a maximum of 2000ms when triggered continuously
     * @param suspend true: suspend monitoring, false: resume monitoring
     */
    suspend(suspend: boolean) {
        this._adapter.suspend(suspend);
    }

    public get history(): HistoryManager {
        return this._adapter.history();
    }

    public async setupDataExporter(initialData: Uint8Array, cb: DataExporter) {
        await this._installExporter(initialData, cb);
        this._adapter.reload();
    }

    public static async init(
        workspace: string,
        options: Partial<
            YjsInitOptions & YjsProviderOptions & BlockClientOptions
        > = {}
    ): Promise<BlockClientInstance> {
        const { importData, exportData, hasExporter, installExporter } =
            getDataExporter();

        const instance = await YjsAdapter.init(workspace, {
            provider: getYjsProviders({
                enabled: [],
                backend: BucketBackend.YjsWebSocketAffine,
                importData,
                exportData,
                hasExporter,
                ...options,
            }),
            ...options,
        });
        return new BlockClient(instance, workspace, {
            ...options,
            installExporter,
        });
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
    ArrayOperation,
    ChangedStates,
    Connectivity,
    MapOperation,
    TextOperation,
} from './adapter';
export type {
    BlockSearchItem,
    Decoration as BlockDecoration,
    ReadableContentExporter as BlockContentExporter,
} from './block';
export { BlockTypes, BucketBackend as BlockBackend } from './types';
export type { BlockTypeKeys } from './types';
export { isBlock } from './utils';
export type { QueryIndexMetadata };
