/* eslint-disable max-lines */
import HotKeys from 'hotkeys-js';
import LRUCache from 'lru-cache';

import { services } from '@toeverything/datasource/db-service';
import type {
    BlockFlavors,
    ReturnEditorBlock,
    UpdateEditorBlock,
} from '@toeverything/datasource/db-service';
import type { PatchNode } from '@toeverything/components/ui';

import { AsyncBlock } from './block';
import type { WorkspaceAndBlockId } from './block';
import type { BaseView } from './views/base-view';
import { SelectionManager } from './selection';
import { Hooks, PluginManager } from './plugin';
import { EditorCommands } from './commands';
import {
    Virgo,
    HooksRunner,
    PluginHooks,
    PluginCreator,
    StorageManager,
    VirgoSelection,
    PluginManagerInterface,
} from './types';
import { KeyboardManager } from './keyboard';
import { MouseManager } from './mouse';
import { ScrollManager } from './scroll';
import assert from 'assert';
import { domToRect, last, Point, sleep } from '@toeverything/utils';
import { Commands } from '@toeverything/datasource/commands';
import { BrowserClipboard } from './clipboard/browser-clipboard';
import { ClipboardPopulator } from './clipboard/clipboard-populator';
import { BlockHelper } from './block/block-helper';
import { DragDropManager } from './drag-drop';

export interface EditorCtorProps {
    workspace: string;
    views: Partial<Record<keyof BlockFlavors, BaseView>>;
    plugins: PluginCreator[];
    rootBlockId?: string;
    isWhiteboard?: boolean;
}

export class Editor implements Virgo {
    private _cacheManager = new LRUCache<string, Promise<AsyncBlock | null>>({
        max: 8192,
        ttl: 1000 * 60 * 30,
    });
    public mouseManager = new MouseManager(this);
    public selectionManager = new SelectionManager(this);
    public keyboardManager = new KeyboardManager(this);
    public scrollManager = new ScrollManager(this);
    public dragDropManager = new DragDropManager(this);
    public commands = new EditorCommands(this);
    public blockHelper = new BlockHelper(this);
    public bdCommands: Commands;
    public ui_container?: HTMLDivElement;
    public version = '0.0.1';
    public copyright = '@Affine 2019-2022';
    private plugin_manager: PluginManager;
    private hooks: Hooks;
    private views: Record<string, BaseView> = {};
    workspace: string;
    readonly = false;
    private root_block_id: string;
    private storage_manager?: StorageManager;
    private clipboard?: BrowserClipboard;
    private clipboard_populator?: ClipboardPopulator;
    public reactRenderRoot: {
        render: PatchNode;
        has: (key: string) => boolean;
    };
    public isWhiteboard = false;
    private _isDisposed = false;

    constructor(props: EditorCtorProps) {
        this.workspace = props.workspace;
        this.views = props.views;
        this.root_block_id = props.rootBlockId || '';
        this.hooks = new Hooks();
        this.plugin_manager = new PluginManager(this, this.hooks);
        this.plugin_manager.registerAll(props.plugins);
        if (props.isWhiteboard) {
            this.isWhiteboard = true;
        }
        for (const [name, block] of Object.entries(props.views)) {
            services.api.editorBlock.registerContentExporter(
                this.workspace,
                name,
                { flavor: name as keyof BlockFlavors },
                block.onExport.bind(block)
            );
            services.api.editorBlock.registerMetadataExporter(
                this.workspace,
                name,
                { flavor: name as keyof BlockFlavors },
                block.onMetadata.bind(block)
            );
            services.api.editorBlock.registerTagExporter(
                this.workspace,
                name,
                { flavor: name as keyof BlockFlavors },
                block.onTagging.bind(block)
            );
        }
        this.bdCommands = new Commands(props.workspace);

        services.api.editorBlock.listenConnectivity(this.workspace, state => {
            console.log(this.workspace, state);
        });

        services.api.editorBlock.onHistoryChange(
            this.workspace,
            'affine',
            map => {
                map.set('node', this.selectionManager.getActivatedNodeId());
                map.set(
                    'selection',
                    this.selectionManager.getLastActiveSelectionSetting()
                );
            }
        );
        services.api.editorBlock.onHistoryRevoke(
            this.workspace,
            'affine',
            async meta => {
                const node = meta.get('node') as string;
                const selection = meta.get('selection') as any;
                await this.selectionManager.activeNodeByNodeId(node);
                await this.selectionManager.setNodeActiveSelection(
                    node,
                    selection
                );
            }
        );
    }

    public set container(v: HTMLDivElement) {
        this.ui_container = v;
        this._initClipboard();
    }

    public get container() {
        return this.ui_container;
    }
    // preference to use withSuspend
    public suspend(flag: boolean) {
        services.api.editorBlock.suspend(this.workspace, flag);
    }

    public async withSuspend<T extends (...args: any[]) => any>(
        fn: T
    ): Promise<Awaited<ReturnType<T>>> {
        services.api.editorBlock.suspend(this.workspace, true);
        const result = await fn();
        services.api.editorBlock.suspend(this.workspace, false);
        return result;
    }

    public setReactRenderRoot(props: {
        patch: PatchNode;
        has: (key: string) => boolean;
    }) {
        this.reactRenderRoot = {
            render: props.patch,
            has: props.has,
        };
    }

    private _disposeClipboard() {
        this.clipboard?.dispose();
        this.clipboard_populator?.disposeInternal();
    }

    private _initClipboard() {
        this._disposeClipboard();
        if (this.ui_container && !this._isDisposed) {
            this.clipboard = new BrowserClipboard(
                this.ui_container,
                this.hooks,
                this
            );
            this.clipboard_populator = new ClipboardPopulator(
                this,
                this.hooks,
                this.selectionManager,
                this.clipboard
            );
        }
    }

    /** Root Block Id */
    getRootBlockId() {
        return this.root_block_id;
    }

    setRootBlockId(rootBlockId: string) {
        this.root_block_id = rootBlockId;
    }

    setHotKeysScope(scope?: string) {
        HotKeys.setScope(scope || 'all');
    }

    /** Block CRUD */

    options = {
        load: ({ workspace, id }: WorkspaceAndBlockId) =>
            this.getBlock({ workspace, id }),
        update: async (patches: UpdateEditorBlock) => {
            return await services.api.editorBlock.update(patches);
        },
        remove: async ({ workspace, id }: WorkspaceAndBlockId) => {
            return await services.api.editorBlock.delete({ workspace, id });
        },
        observe: async (
            { workspace, id }: WorkspaceAndBlockId,
            callback: (blockData: ReturnEditorBlock) => void
        ) => {
            return await services.api.editorBlock.observe(
                { workspace, id },
                callback
            );
        },
    };

    getView(type: string) {
        return this.views[type];
    }

    private async _initBlock(
        blockData: ReturnEditorBlock
    ): Promise<AsyncBlock | null> {
        if (!blockData) {
            return null;
        }
        const block = new AsyncBlock({
            initData: blockData,
            viewClass: this.getView(blockData.type),
            services: {
                load: (...args) => this.getBlock(...args),
                update: (...args) => this.options.update(...args),
                remove: (...args) => this.options.remove(...args),
                observe: (...args) => this.options.observe(...args),
            },
        });
        await block.init();
        const blockView = this.getView(block.type);
        if (!blockView) {
            return null;
        }
        block.setLifeCycle({
            onUpdate: blockView.onUpdate,
        });
        block.registerProvider({
            blockView: blockView,
        });
        return await blockView.onCreate(block);
    }

    private async getBlock({
        workspace,
        id,
    }: WorkspaceAndBlockId): Promise<AsyncBlock | null> {
        const block = this._cacheManager.get(id);
        if (block) {
            return block;
        }
        const block_promise = new Promise<AsyncBlock | null>(resolve => {
            const create = async () => {
                const blocksData = await services.api.editorBlock.get({
                    workspace,
                    ids: [id],
                });
                if (!blocksData.length) {
                    console.warn('Failed to get blocks_data', id);
                    resolve(null);
                    return;
                }
                if (blocksData && blocksData[0]) {
                    const asyncBlock = await this._initBlock(blocksData[0]);
                    if (!asyncBlock) {
                        // console.warn('Failed to initBlock', id, blocksData);
                        resolve(null);
                        return;
                    }
                    resolve(asyncBlock);
                }
            };
            create();
        });
        this._cacheManager.set(id, block_promise);
        return await block_promise;
    }

    async createBlock(type: keyof BlockFlavors, parentId?: string) {
        assert(type, `The block type is missing.`);
        const blockData = await services.api.editorBlock.create({
            workspace: this.workspace,
            type,
            parentId,
        });
        const block = await this._initBlock(blockData);
        if (block) {
            this._cacheManager.set(block.id, Promise.resolve(block));
        }
        return block;
    }

    async getBlockById(blockId: string): Promise<AsyncBlock | null> {
        return await this.getBlock({ workspace: this.workspace, id: blockId });
    }

    /**
     * TODO: to be optimized
     * get block`s dom by block`s id
     * @param {string} blockId
     * @param {number} [times=1]
     * @return {*}  {(Promise<HTMLElement | null>)}
     * @memberof Editor
     */
    async getBlockDomById(
        blockId: string,
        times = 1
    ): Promise<HTMLElement | null> {
        const block = await this.getBlockById(blockId);
        if (times === 10) {
            console.warn('render');
            return null;
        }
        if (block) {
            if (block.dom) {
                return block.dom;
            }
            await sleep(16);
            return this.getBlockDomById(blockId, times + 1);
        }
        return null;
    }

    async getBlockList() {
        const rootBlockId = this.getRootBlockId();
        const rootBlock = await this.getBlockById(rootBlockId);
        const blockList: Array<AsyncBlock> = rootBlock ? [rootBlock] : [];
        const children = (await rootBlock?.children()) || [];
        for (const block of children) {
            if (!block) {
                continue;
            }
            const blockChildren = await block.children();
            blockList.push(block);
            if (blockChildren) {
                children.push(...blockChildren);
            }
        }
        return blockList;
    }

    async getRootLastChildrenBlock(rootBlockId = this.getRootBlockId()) {
        const rootBlock = await this.getBlockById(rootBlockId);
        if (!rootBlock) {
            throw new Error('root block is not found');
        }
        const lastChildren = await rootBlock.lastChild();
        return lastChildren ?? rootBlock;
    }

    async getLastBlock(rootBlockId = this.getRootBlockId()) {
        const rootBlock = await this.getBlockById(rootBlockId);
        if (!rootBlock) {
            throw new Error('root block is not found');
        }
        let lastBlock = rootBlock;
        let children = await rootBlock.children();
        while (children.length) {
            // Safe type assert because the length of children has been checked
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            lastBlock = last(children)!;
            children = (await lastBlock?.children()) || [];
        }
        return lastBlock;
    }

    async getBlockByPoint(point: Point) {
        const blockList = await this.getBlockList();

        return blockList.reverse().find(block => {
            return (
                Boolean(block.dom) && domToRect(block.dom).isContainPoint(point)
            );
        });
    }

    async undo() {
        await services.api.editorBlock.undo(this.workspace);
    }

    async redo() {
        await services.api.editorBlock.redo(this.workspace);
    }

    async search(query: Parameters<typeof services.api.editorBlock.search>[1]) {
        return services.api.editorBlock.search(this.workspace, query);
    }

    async queryBlock(query: any) {
        return await services.api.editorBlock.query(this.workspace, query);
    }

    /** Hooks */

    public getHooks(): HooksRunner & PluginHooks {
        return this.hooks;
    }

    public get storageManager(): StorageManager | undefined {
        return this.storage_manager;
    }

    public get selection(): VirgoSelection {
        return this.selectionManager;
    }

    public get plugins(): PluginManagerInterface {
        return this.plugin_manager;
    }

    public async page2html(): Promise<string> {
        const parse = this.clipboard?.getClipboardParse();
        if (!parse) {
            return '';
        }
        const html_str = await parse.page2html();
        return html_str;
    }

    dispose() {
        this._isDisposed = true;
        Object.keys(this.views).map(name =>
            services.api.editorBlock.unregisterContentExporter(
                this.workspace,
                name
            )
        );
        this.keyboardManager.dispose();
        this.hooks.dispose();
        this.plugin_manager.dispose();
        this.selectionManager.dispose();
        this.dragDropManager.dispose();
        this._disposeClipboard();
    }
}
