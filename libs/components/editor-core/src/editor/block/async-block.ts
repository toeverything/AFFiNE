/* eslint-disable max-lines */
import EventEmitter from 'eventemitter3';
import {
    ReturnEditorBlock,
    UpdateEditorBlock,
    DefaultColumnsValue,
    Protocol,
} from '@toeverything/datasource/db-service';
import {
    isDev,
    createNoopWithMessage,
    lowerFirst,
    last,
} from '@toeverything/utils';
import { BlockProvider } from './block-provider';
import { BaseView, BaseView as BlockView } from './../views/base-view';

type EventType = 'update';
export interface EventData {
    block: AsyncBlock;
    oldData?: ReturnEditorBlock;
}
type EventCallback = (eventData: EventData) => void;

export interface WorkspaceAndBlockId {
    workspace: string;
    id: string;
}

type Unobserve = () => void;
type Observe = (
    workspaceAndBlockId: WorkspaceAndBlockId,
    callback: (blockData: ReturnEditorBlock) => void
) => Promise<Unobserve>;

export interface BlockNodeCtorOptions {
    initData: ReturnEditorBlock;
    viewClass: BaseView;
    services: AsyncBlockServices;
}
interface AsyncBlockServices {
    /**
     * Used to monitor block data changes
     */
    observe: Observe;
    /**
     * for loading child nodes
     */
    load: (
        workspaceAndBlockId: WorkspaceAndBlockId
    ) => Promise<AsyncBlock | null>;
    /**
     * Used to update block data
     */
    update: (patches: UpdateEditorBlock) => Promise<boolean>;
    /**
     * delete block
     */
    remove: (workspaceAndBlockId: WorkspaceAndBlockId) => Promise<boolean>;
}

interface LifeCycleHook {
    /**
     * Triggered when the block data changes
     */
    onUpdate: (event: EventData) => Promise<void>;
}
function eventNameFromHookName(hookName: string) {
    return hookName.replace(/^on([A-Z].+)/, (matched, name) =>
        lowerFirst(name)
    );
}

export class AsyncBlock {
    private raw_data: ReturnEditorBlock;
    private services: AsyncBlockServices = {
        observe: createNoopWithMessage({
            module: 'AsyncBlock',
            message: 'observe not set',
        }),
        load: createNoopWithMessage({
            module: 'AsyncBlock',
            message: 'load not set',
        }),
        update: createNoopWithMessage({
            module: 'AsyncBlock',
            message: 'update not set',
        }),
        remove: createNoopWithMessage({
            module: 'AsyncBlock',
            message: 'remove not set',
        }),
    };
    private life_cycle?: LifeCycleHook = {
        onUpdate: createNoopWithMessage({
            module: 'AsyncBlock',
            message: 'onUpdate not set',
        }),
    };

    private event_emitter = new EventEmitter();

    private viewClass: BaseView;

    public dom?: HTMLElement;
    public renderPath: string[] = [];

    public blockProvider?: BlockProvider;
    public firstCreateFlag?: boolean;
    private initialized = false;

    constructor(options: BlockNodeCtorOptions) {
        const { initData, viewClass, services } = options;
        const { id } = initData;
        this.renderPath = [id];
        this.raw_data = initData;
        this.viewClass = viewClass;
        this.services = services;
    }

    registerProvider(options: { blockView: BlockView }) {
        this.blockProvider = new BlockProvider({
            block: this as AsyncBlock,
            blockView: options.blockView,
        });
    }

    dispose() {
        this.unobserve?.();
        this.unobserve = undefined;
    }

    setLifeCycle(lifeCycle: LifeCycleHook) {
        if (this.life_cycle) {
            Object.entries(this.life_cycle).forEach(([key, callback]) => {
                this.off(eventNameFromHookName(key) as EventType, callback);
            });
        }
        this.life_cycle = lifeCycle;
        Object.entries(this.life_cycle).forEach(([key, callback]) => {
            this.on(eventNameFromHookName(key) as EventType, callback);
        });
    }

    // Internally monitor db block data changes
    private unobserve?: Unobserve;
    async init() {
        if (this.initialized) {
            console.error(
                'The block is already initialized! Please do not repeat call the init!',
                this
            );
            return;
        }
        this.initialized = true;
        this.raw_data = await this.filterPageInvalidChildren(this.raw_data);
        const { workspace, id } = this.raw_data;
        this.unobserve = await this.services.observe(
            { workspace, id },
            async blockData => {
                const oldData = this.raw_data;
                this.raw_data = blockData;
                this.raw_data = await this.filterPageInvalidChildren(blockData);
                this.emit('update', { block: this, oldData });
            }
        );
    }

    private on(eventName: EventType, callback: EventCallback) {
        return this.event_emitter.on(eventName, callback);
    }

    private off(eventName: EventType, callback: EventCallback) {
        return this.event_emitter.off(eventName, callback);
    }

    private emit(eventName: EventType, eventData: EventData) {
        return this.event_emitter.emit(eventName, eventData);
    }

    onUpdate(callback: (event: EventData) => void) {
        this.on('update', callback);
        return () => {
            this.off('update', callback);
        };
    }

    get id() {
        return this.raw_data.id;
    }

    get workspace() {
        return this.raw_data.workspace;
    }

    get type() {
        return this.raw_data.type;
    }

    get created() {
        return this.raw_data.created;
    }

    get createdDate() {
        if (isDev) {
            return new Date(this.created);
        }
        console.error('createDate is only allowed in development environment');
        return undefined;
    }

    get lastUpdated() {
        return this.raw_data.lastUpdated;
    }

    get lastUpdatedDate() {
        if (isDev) {
            return new Date(this.lastUpdated);
        }
        console.error(
            'only allowed to use lastUpdatedDate in development environment'
        );
        return undefined;
    }

    get columns() {
        return this.raw_data.columns;
    }

    get parentId() {
        return this.raw_data.parentId;
    }

    async parent() {
        return this.load_node(this.raw_data.parentId || '');
    }

    get childrenIds() {
        return this.raw_data.children;
    }

    async children() {
        return await this.load_nodes(this.raw_data.children);
    }

    async childAt(position: number) {
        const child_id = this.raw_data.children[position];
        if (!child_id) {
            return null;
        }
        return this.load_node(child_id);
    }

    /**
     * Returns the index of the child in the group, or -1 if it is not present.
     */
    findChildIndex(childId: string) {
        return this.raw_data.children.indexOf(childId);
    }

    async firstChild() {
        const children = this.raw_data.children;
        if (!children?.length) {
            return null;
        }
        return this.load_node(children[0]);
    }

    async lastChild() {
        const children = this.raw_data.children;
        if (!children?.length) {
            return null;
        }
        return this.load_node(children[children.length - 1]);
    }

    /**
     * Remove all children from block
     */
    async removeChildren() {
        return this.services.update({
            id: this.id,
            workspace: this.raw_data.workspace,
            children: [],
        });
    }

    async nextSibling() {
        const parent = await this.parent();
        if (!parent) {
            return null;
        }
        const position = parent.findChildIndex(this.id);
        if (position === -1) {
            return null;
        }
        return await parent.childAt(position + 1);
    }

    async nextSiblings() {
        const parent = await this.parent();
        if (!parent) {
            return [];
        }
        const position = parent.findChildIndex(this.id);
        if (position === -1) {
            return [];
        }
        return await this.load_nodes(
            parent.raw_data.children.slice(position + 1)
        );
    }

    async previousSibling() {
        const parent = await this.parent();
        if (!parent) {
            return null;
        }
        const position = parent.findChildIndex(this.id);
        if (position < 1) {
            return null;
        }
        return await parent.childAt(position - 1);
    }

    async physicallyPerviousSibling(): Promise<null | AsyncBlock> {
        let preNode = await this.previousSibling();
        // if preNode is not parent level check if previous block has selectable children
        if (preNode) {
            let children = await preNode.children();
            // loop until find the latest deepest children block
            while (children && children.length) {
                preNode = last(children) || null;
                if (preNode) {
                    children = await preNode.children();
                }
            }
        } else {
            preNode = await this.parent();
        }
        return preNode || null;
    }

    async previousSiblings() {
        const parent = await this.parent();
        if (!parent) {
            return [];
        }
        const position = parent.findChildIndex(this.id);
        if (position < 1) {
            return [];
        }
        return await this.load_nodes(
            parent.raw_data.children.slice(0, position)
        );
    }

    async insert(position: number, blocks: AsyncBlock[]) {
        const children = [...this.raw_data.children];
        children.splice(position, 0, ...blocks.map(block => block.id));
        return this.services.update({
            id: this.id,
            workspace: this.raw_data.workspace,
            children,
        });
    }

    async append(...blocks: AsyncBlock[]) {
        return await this.insert(this.raw_data.children.length, blocks);
    }

    async prepend(...blocks: AsyncBlock[]) {
        return await this.insert(0, blocks);
    }

    async after(...blocks: AsyncBlock[]) {
        const parent = await this.parent();
        if (!parent) {
            return false;
        }
        const position = parent.findChildIndex(this.id);
        if (position === -1) {
            return false;
        }
        return await parent.insert(position + 1, blocks);
    }

    async before(...blocks: AsyncBlock[]) {
        const parent = await this.parent();
        if (!parent) {
            return false;
        }
        const position = parent.findChildIndex(this.id);
        if (position === -1) {
            return false;
        }
        return await parent.insert(position, blocks);
    }

    async remove(): Promise<boolean> {
        const parentId = this.parentId;
        const ret = await this.services.remove({
            workspace: this.raw_data.workspace,
            id: this.raw_data.id,
        });
        const parent = await this.services.load({
            workspace: this.raw_data.workspace,
            id: parentId,
        });
        if (ret && parent !== null && parent.viewClass) {
            return await parent.viewClass.onDeleteChild(parent);
        }
        return ret;
    }

    async setType(type: ReturnEditorBlock['type']) {
        return this.services.update({
            id: this.id,
            workspace: this.raw_data.workspace,
            type,
        });
    }

    getProperty<
        T extends keyof DefaultColumnsValue = keyof DefaultColumnsValue
    >(key: T): DefaultColumnsValue[T] | undefined {
        return (this.raw_data.properties as any)?.[
            key
        ] as DefaultColumnsValue[T];
    }

    getProperties(): DefaultColumnsValue {
        return this.raw_data.properties as DefaultColumnsValue;
    }

    async setProperty<
        T extends keyof DefaultColumnsValue = keyof DefaultColumnsValue
    >(key: T, value: DefaultColumnsValue[T]) {
        return this.services.update({
            id: this.id,
            workspace: this.raw_data.workspace,
            properties: {
                [key]: value,
            },
        });
    }

    async setProperties(properties: Partial<DefaultColumnsValue>) {
        return this.services.update({
            id: this.id,
            workspace: this.raw_data.workspace,
            properties: properties as Record<string, unknown>,
        });
    }

    async removeProperty<
        T extends keyof DefaultColumnsValue = keyof DefaultColumnsValue
    >(key: T) {
        return this.services.update({
            id: this.id,
            workspace: this.raw_data.workspace,
            properties: {
                [key]: undefined,
            },
        });
    }

    private async load_node(id: string): Promise<AsyncBlock | null> {
        return await this.services.load({
            workspace: this.raw_data.workspace,
            id,
        });
    }

    private async load_nodes(ids: string[]): Promise<Array<AsyncBlock>> {
        return (await Promise.all(ids.map(id => this.load_node(id)))).filter(
            Boolean
        ) as AsyncBlock[];
    }

    /**
     * Filter the shape children from the page block
     */
    async filterPageInvalidChildren(rawData: ReturnEditorBlock) {
        if (rawData.type !== Protocol.Block.Type.page) {
            return rawData;
        }
        // The load node method will filter invalid children automatically
        const children = await this.load_nodes(this.raw_data.children);
        rawData.children = children.map(child => child.id);
        return rawData;
    }

    // Get block location information
    getBoundingClientRect() {
        return this.dom?.getBoundingClientRect();
    }
}
