import {
    BlockFlavorKeys,
    BlockFlavors,
    BlockTypeKeys,
    BlockTypes,
} from '../types';
import { getLogger } from '../utils';
import {
    BlockInstance,
    BlockListener,
    BlockPosition,
    ContentOperation,
    ContentTypes,
    HistoryManager,
    MapOperation,
} from '../yjs/types';

declare const JWT_DEV: boolean;
const logger = getLogger('BlockDB:block');
const logger_debug = getLogger('debug:BlockDB:block');

const _GET_BLOCK = Symbol('GET_BLOCK');
const _SET_PARENT = Symbol('SET_PARENT');

export class AbstractBlock<
    B extends BlockInstance<C>,
    C extends ContentOperation
> {
    private readonly _id: string;
    private readonly _block: BlockInstance<C>;
    private readonly _history: HistoryManager;
    private readonly _root: AbstractBlock<B, C> | undefined;
    private readonly _parentListener: Map<string, BlockListener>;

    private _parent: AbstractBlock<B, C> | undefined;
    private _changeParent?: () => void;

    constructor(
        block: B,
        root?: AbstractBlock<B, C>,
        parent?: AbstractBlock<B, C>
    ) {
        this._id = block.id;
        this._block = block;
        this._history = this._block.scopedHistory([this._id]);

        this._root = root;
        this._parentListener = new Map();

        JWT_DEV && logger_debug(`init: exists ${this._id}`);
        if (parent) {
            this._refreshParent(parent);
        }
    }

    public get root() {
        return this._root;
    }

    protected get parent_node() {
        return this._parent;
    }

    protected _getParentPage(warning = true): string | undefined {
        if (this.flavor === 'page') {
            return this._block.id;
        } else if (!this._parent) {
            if (warning && this.flavor !== 'workspace') {
                console.warn('parent not found');
            }
            return undefined;
        } else {
            return this._parent.parent_page;
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
            this._parentListener.set(name, callback);
        } else {
            this._block.on(event, name, callback);
        }
    }

    public off(event: 'content' | 'children' | 'parent', name: string) {
        if (event === 'parent') {
            this._parentListener.delete(name);
        } else {
            this._block.off(event, name);
        }
    }

    public addChildrenListener(name: string, listener: BlockListener) {
        this._block.addChildrenListener(name, listener);
    }

    public removeChildrenListener(name: string) {
        this._block.removeChildrenListener(name);
    }

    public addContentListener(name: string, listener: BlockListener) {
        this._block.addContentListener(name, listener);
    }

    public removeContentListener(name: string) {
        this._block.removeContentListener(name);
    }

    public getContent<
        T extends ContentTypes = ContentOperation
    >(): MapOperation<T> {
        if (this._block.type === BlockTypes.block) {
            return this._block.content.asMap() as MapOperation<T>;
        }
        throw new Error(
            `this block not a structured block: ${this._id}, ${this._block.type}`
        );
    }

    public getBinary(): ArrayBuffer | undefined {
        if (this._block.type === BlockTypes.binary) {
            return this._block.content.asArray<ArrayBuffer>()?.get(0);
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
                    ?.replace(/-/g, '');
            }
            // eslint-disable-next-line no-empty
        } catch (e) {}
        return undefined;
    }

    // Last update UTC time
    public get lastUpdated(): number {
        return this._block.updated || this._block.created;
    }

    private get last_updated_date(): string | undefined {
        return this.get_date_text(this.lastUpdated);
    }

    // create UTC time
    public get created(): number {
        return this._block.created;
    }

    private get created_date(): string | undefined {
        return this.get_date_text(this.created);
    }

    // creator id
    public get creator(): string | undefined {
        return this._block.creator;
    }

    [_GET_BLOCK]() {
        return this._block;
    }

    private _emitParent(
        parentId: string,
        type: 'update' | 'delete' = 'update'
    ) {
        const states: Map<string, 'update' | 'delete'> = new Map([
            [parentId, type],
        ]);
        for (const listener of this._parentListener.values()) {
            listener(states);
        }
    }

    private _refreshParent(parent: AbstractBlock<B, C>) {
        this._changeParent?.();
        parent.addChildrenListener(this._id, states => {
            if (states.get(this._id) === 'delete') {
                this._emitParent(parent._id, 'delete');
            }
        });

        this._parent = parent;
        this._changeParent = () => parent.removeChildrenListener(this._id);
    }

    [_SET_PARENT](parent: AbstractBlock<B, C>) {
        this._refreshParent(parent);
        this._emitParent(parent.id);
    }

    /**
     * Get document index tags
     */
    public getTags(): string[] {
        const created = this.created_date;
        const updated = this.last_updated_date;

        return [
            `id:${this._id}`,
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
        return this._id;
    }

    /**
     * current block type
     */
    public get type(): typeof BlockTypes[BlockTypeKeys] {
        return this._block.type;
    }

    /**
     * current block flavor
     */
    public get flavor(): typeof BlockFlavors[BlockFlavorKeys] {
        return this._block.flavor;
    }

    // TODO: flavor needs optimization
    setFlavor(flavor: typeof BlockFlavors[BlockFlavorKeys]) {
        this._block.setFlavor(flavor);
    }

    public get children(): string[] {
        return this._block.children;
    }

    /**
     * Insert children block
     * @param block Block instance
     * @param position Insertion position, if it is empty, it will be inserted at the end. If the block already exists, the position will be moved
     * @returns
     */
    public async insertChildren(
        block: AbstractBlock<B, C>,
        position?: BlockPosition
    ) {
        JWT_DEV && logger(`insertChildren: start`);

        if (block.id === this._id) {
            // avoid self-reference
            return;
        }
        if (
            this.type !== BlockTypes.block || // binary cannot insert children blocks
            (block.type !== BlockTypes.block &&
                this.flavor !== BlockFlavors.workspace) // binary can only be inserted into workspace
        ) {
            throw new Error('insertChildren: binary not allow insert children');
        }

        this._block.insertChildren(block[_GET_BLOCK](), position);
        block[_SET_PARENT](this);
    }

    public hasChildren(id: string): boolean {
        return this._block.hasChildren(id);
    }

    /**
     * Get an instance of the child Block
     * @param blockId block id
     * @returns
     */
    protected get_children(blockId?: string): BlockInstance<C>[] {
        JWT_DEV && logger(`get children: ${blockId}`);
        return this._block.getChildren([blockId]);
    }

    public removeChildren(blockId?: string) {
        this._block.removeChildren([blockId]);
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
        return this._history;
    }
}
