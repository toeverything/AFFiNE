import {
    BlockInstance,
    BlockListener,
    BlockPosition,
    ContentOperation,
    ContentTypes,
    HistoryManager,
    MapOperation,
} from '../adapter';
import {
    BlockTypes,
    BlockTypeKeys,
    BlockFlavors,
    BlockFlavorKeys,
} from '../types';
import { getLogger } from '../utils';

declare const JWT_DEV: boolean;
const logger = getLogger('BlockDB:block');
const logger_debug = getLogger('debug:BlockDB:block');

const GET_BLOCK = Symbol('GET_BLOCK');
const SET_PARENT = Symbol('SET_PARENT');

export class AbstractBlock<
    B extends BlockInstance<C>,
    C extends ContentOperation
> {
    readonly #id: string;
    readonly #block: BlockInstance<C>;
    readonly #history: HistoryManager;
    readonly #root?: AbstractBlock<B, C>;
    readonly #parent_listener: Map<string, BlockListener>;

    #parent?: AbstractBlock<B, C>;

    constructor(
        block: B,
        root?: AbstractBlock<B, C>,
        parent?: AbstractBlock<B, C>
    ) {
        this.#id = block.id;
        this.#block = block;
        this.#history = this.#block.scopedHistory([this.#id]);

        this.#root = root;
        this.#parent_listener = new Map();
        this.#parent = parent;
        JWT_DEV && logger_debug(`init: exists ${this.#id}`);
    }

    public get root() {
        return this.#root;
    }

    protected get parent_node() {
        return this.#parent;
    }

    protected _getParentPage(warning = true): string | undefined {
        if (this.flavor === 'page') {
            return this.#block.id;
        } else if (!this.#parent) {
            if (warning && this.flavor !== 'workspace') {
                console.warn('parent not found');
            }
            return undefined;
        } else {
            return this.#parent.parent_page;
        }
    }

    public get parent_page(): string | undefined {
        return this._getParentPage();
    }

    public on(
        event: 'content' | 'children' | 'parent',
        name: string,
        callback: BlockListener
    ) {
        if (event === 'parent') {
            this.#parent_listener.set(name, callback);
        } else {
            this.#block.on(event, name, callback);
        }
    }

    public off(event: 'content' | 'children' | 'parent', name: string) {
        if (event === 'parent') {
            this.#parent_listener.delete(name);
        } else {
            this.#block.off(event, name);
        }
    }

    public addChildrenListener(name: string, listener: BlockListener) {
        this.#block.addChildrenListener(name, listener);
    }

    public removeChildrenListener(name: string) {
        this.#block.removeChildrenListener(name);
    }

    public addContentListener(name: string, listener: BlockListener) {
        this.#block.addContentListener(name, listener);
    }

    public removeContentListener(name: string) {
        this.#block.removeContentListener(name);
    }

    public getContent<
        T extends ContentTypes = ContentOperation
    >(): MapOperation<T> {
        if (this.#block.type === BlockTypes.block) {
            return this.#block.content.asMap() as MapOperation<T>;
        }
        throw new Error(
            `this block not a structured block: ${this.#id}, ${
                this.#block.type
            }`
        );
    }

    public getBinary(): ArrayBuffer | undefined {
        if (this.#block.type === BlockTypes.binary) {
            return this.#block.content.asArray<ArrayBuffer>()?.get(0);
        }
        throw new Error('this block not a binary block');
    }

    public get<R = unknown>(path: string[]): R {
        const content = this.getContent();
        return content.autoGet(content, path) as R;
    }

    public set<V = unknown>(path: string[], value: V, partial?: boolean) {
        const content = this.getContent();
        content.autoSet(content, path, value, partial);
    }

    private get_date_text(timestamp?: number): string | undefined {
        try {
            if (timestamp && !Number.isNaN(timestamp)) {
                return new Date(timestamp)
                    .toISOString()
                    .split('T')[0]
                    .replace(/-/g, '');
            }
            // eslint-disable-next-line no-empty
        } catch (e) {}
        return undefined;
    }

    // Last update UTC time
    public get lastUpdated(): number {
        return this.#block.updated || this.#block.created;
    }

    private get last_updated_date(): string | undefined {
        return this.get_date_text(this.lastUpdated);
    }

    // create UTC time
    public get created(): number {
        return this.#block.created;
    }

    private get created_date(): string | undefined {
        return this.get_date_text(this.created);
    }

    // creator id
    public get creator(): string | undefined {
        return this.#block.creator;
    }

    [GET_BLOCK]() {
        return this.#block;
    }

    [SET_PARENT](parent: AbstractBlock<B, C>) {
        this.#parent = parent;
        const states: Map<string, 'update'> = new Map([[parent.id, 'update']]);
        for (const listener of this.#parent_listener.values()) {
            listener(states);
        }
    }

    /**
     * Get document index tags
     */
    public getTags(): string[] {
        const created = this.created_date;
        const updated = this.last_updated_date;

        return [
            `id:${this.#id}`,
            `type:${this.type}`,
            `type:${this.flavor}`,
            this.flavor === BlockFlavors.page && `type:doc`, // normal documentation
            this.flavor === BlockFlavors.tag && `type:card`, // tag document
            // this.type === ??? && `type:theorem`, // global marked math formula
            created && `created:${created}`,
            updated && `updated:${updated}`,
        ].filter((v): v is string => !!v);
    }

    /**
     * current document instance id
     */
    public get id(): string {
        return this.#id;
    }

    /**
     * current block type
     */
    public get type(): typeof BlockTypes[BlockTypeKeys] {
        return this.#block.type;
    }

    /**
     * current block flavor
     */
    public get flavor(): typeof BlockFlavors[BlockFlavorKeys] {
        return this.#block.flavor;
    }

    // TODO: flavor needs optimization
    setFlavor(flavor: typeof BlockFlavors[BlockFlavorKeys]) {
        this.#block.setFlavor(flavor);
    }

    public get children(): string[] {
        return this.#block.children;
    }

    /**
     * Insert sub-Block
     * @param block Block instance
     * @param position Insertion position, if it is empty, it will be inserted at the end. If the block already exists, the position will be moved
     * @returns
     */
    public async insertChildren(
        block: AbstractBlock<B, C>,
        position?: BlockPosition
    ) {
        JWT_DEV && logger(`insertChildren: start`);

        if (block.id === this.#id) return; // avoid self-reference
        if (
            this.type !== BlockTypes.block || // binary cannot insert subblocks
            (block.type !== BlockTypes.block &&
                this.flavor !== BlockFlavors.workspace) // binary can only be inserted into workspace
        ) {
            throw new Error('insertChildren: binary not allow insert children');
        }

        this.#block.insertChildren(block[GET_BLOCK](), position);
        block[SET_PARENT](this);
    }

    public hasChildren(id: string): boolean {
        return this.#block.hasChildren(id);
    }

    /**
     * Get an instance of the child Block
     * @param blockId block id
     * @returns
     */
    protected get_children(blockId?: string): BlockInstance<C>[] {
        JWT_DEV && logger(`get children: ${blockId}`);
        return this.#block.getChildren([blockId]);
    }

    public removeChildren(blockId?: string) {
        this.#block.removeChildren([blockId]);
    }

    public remove() {
        JWT_DEV && logger(`remove: ${this.id}`);
        if (this.flavor !== BlockFlavors.workspace) {
            // Pages other than workspace have parents
            this.parent_node!.removeChildren(this.id);
        }
    }

    public update(path: string[], value: Record<string, any>) {
        this.set(path, value);
    }

    private insert_blocks(
        parentNode: AbstractBlock<B, C> | undefined,
        blocks: AbstractBlock<B, C>[],
        placement: 'before' | 'after',
        referenceNode?: AbstractBlock<B, C>
    ) {
        if (!blocks || blocks.length === 0 || !parentNode) {
            return;
        }
        // TODO: array equal
        if (
            !referenceNode &&
            parentNode.children.join('') ===
                blocks.map(node => node.id).join('')
        ) {
            return;
        }
        blocks.forEach(block => {
            if (block.parent_node) {
                block.remove();
            }

            const placement_info = {
                [placement]:
                    referenceNode?.id ||
                    (parentNode.hasChildNodes() &&
                        parentNode.children[
                            placement === 'before'
                                ? 0
                                : parentNode.children.length - 1
                        ]),
            };

            parentNode.insertChildren(
                block,
                placement_info[placement] ? placement_info : undefined
            );
        });
    }

    prepend(...blocks: AbstractBlock<B, C>[]) {
        this.insert_blocks(this, blocks.reverse(), 'before');
    }

    append(...blocks: AbstractBlock<B, C>[]) {
        this.insert_blocks(this, blocks, 'after');
    }

    before(...blocks: AbstractBlock<B, C>[]) {
        this.insert_blocks(this.parent_node, blocks, 'before', this);
    }

    after(...blocks: AbstractBlock<B, C>[]) {
        this.insert_blocks(this.parent_node, blocks.reverse(), 'after', this);
    }

    hasChildNodes() {
        return this.children.length > 0;
    }

    hasParent(blockId?: string) {
        let parent = this.parent_node;
        while (parent) {
            if (parent.id === blockId) {
                return true;
            }
            parent = parent.parent_node;
        }
        return false;
    }

    /**
     * TODO: scoped history
     */
    public get history(): HistoryManager {
        return this.#history;
    }
}
