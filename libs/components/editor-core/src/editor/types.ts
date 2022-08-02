/**
 * Editor plug-in mechanism design
 * 1. Plug-ins are not aware of each other
 * 2. Disable dom operations in plugins, such as operating dom, monitoring mouse and keyboard events, etc.
 * 3. Interact with Editor through EditorApi, get value and set value
 * 4. Through the hook, complete the callback of the Editor, just make the callback,
 * Therefore, the parameters in the hook cannot directly transmit the reference data in the Editor to prevent the Plugin from modifying it.
 * 5. All Plugins should inherit from BasePlugin, in the form of objects
 * 6. Dependencies between plugins are not supported for the time being
 */
// import { CompleteInfoSelectOption } from '@authing/react-ui-components/components/CompleteInfo/interface';
import type {
    BlockFlavors,
    BlockFlavorKeys,
} from '@toeverything/datasource/db-service';
import type { PatchNode } from '@toeverything/components/ui';
import type { IdList, SelectionInfo, SelectionManager } from './selection';

import type { AsyncBlock } from './block';
import type { BlockHelper } from './block/block-helper';
import type { BlockCommands } from './commands/block-commands';
import type { DragDropManager } from './drag-drop';
import { MouseManager } from './mouse';
import { Observable } from 'rxjs';
import { Point } from '@toeverything/utils';
import { ScrollManager } from './scroll';

// import { BrowserClipboard } from './clipboard/browser-clipboard';

export interface StorageManager {
    // createStorage: () => void;
    // removeStorage: () => void;
}

export interface Commands {
    blockCommands: Pick<
        BlockCommands,
        | 'createNextBlock'
        | 'convertBlock'
        | 'removeBlock'
        | 'splitGroupFromBlock'
        | 'mergeGroup'
    >;
    textCommands: {
        getBlockText: (blockId: string) => Promise<string>;
        setBlockText: (blockId: string, text: string) => void;
    };
}

export interface VirgoSelection {
    currentSelectInfo: SelectionInfo;
    getSelectedNodesIds: () => IdList;
    setSelectedNodesIds: (nodesIdsList: IdList) => void;
    onSelectionChange: (
        handler: (selectionInfo: SelectionInfo) => void
    ) => void;
    unBindSelectionChange: (
        handler: (selectionInfo: SelectionInfo) => void
    ) => void;
    onSelectEnd: (cb: (info: SelectionInfo) => void) => () => void;
    convertSelectedNodesToGroup: (nodes?: AsyncBlock[]) => Promise<void>;
}

// Editor's external API
export interface Virgo {
    selectionManager: SelectionManager;
    scrollManager: ScrollManager;
    createBlock: (
        type: keyof BlockFlavors,
        parentId?: string
    ) => Promise<AsyncBlock>;
    getRootBlockId: () => string;
    getBlockById(blockId: string): Promise<AsyncBlock | null>;
    setHotKeysScope(scope?: string): void;
    getBlockList: () => Promise<AsyncBlock[]>;
    // removeBlocks: () => void;
    storageManager: StorageManager | undefined;
    selection: VirgoSelection;
    plugins: PluginManagerInterface;
    /**
     * commands bind with editor , use for change model data
     * if want to get some block info use block helper
     */
    commands: Commands;
    container: HTMLDivElement;
    /**
     * Block helper aim to get block`s self infos, is has some function for changing block use them carefully
     */
    blockHelper: BlockHelper;
    dragDropManager: DragDropManager;
    // getRenderNodeById: () => void; // Post removal to transform the corresponding function through the hook mechanism
    // container is removed later using the attachElement interface
    readonly: boolean;
    // getRootRenderId is removed later and the corresponding function is modified through the hook mechanism
    // getRootRenderNode is later removed to transform the corresponding function through the hook mechanism
    // dispatchAction needs to be designed to transform the corresponding function through the hook mechanism
    // Plugin.actions needs to be designed to transform the corresponding functions through the hook mechanism
    // renderNodeMap is removed later and the corresponding function is transformed through the hook mechanism
    // getDomByBlockId is removed later and the corresponding function is modified through the hook mechanism
    // registerHotKey is later removed and the corresponding function is modified through the hook mechanism
    // unregisterHotKey is later removed to transform the corresponding function through the hook mechanism
    // eventEmitter needs to be designed to transform the corresponding function through the hook mechanism
    // getAllBlockTypes later removed
    reactRenderRoot: {
        render: PatchNode;
        has: (key: string) => boolean;
    };
    // clipboard: BrowserClipboard;
    workspace: string;
    getBlockDomById: (id: string) => Promise<HTMLElement>;
    getBlockByPoint: (point: Point) => Promise<AsyncBlock>;
    getGroupBlockByPoint: (point: Point) => Promise<AsyncBlock>;
    isWhiteboard: boolean;
    mouseManager: MouseManager;
}

export interface Plugin {
    init: () => void;
    dispose: () => void;
}

export interface PluginCreator {
    // Unique identifier to distinguish between different Plugins
    pluginName: string;
    // Priority, the higher the number, the higher the priority? ? Is it necessary to put it at the hook level?
    priority: number;
    // According to different capabilities, the api of editor/hooks will be different
    // If the capability to which the api belongs is enabled, the api will throw error
    // For example, a plug-in is a plug-in related to encrypted storage to localStorage, and needs to declare storage capability
    // Then operate localStorage through the encapsulated storage api
    // And when the plugin is uninstalled (such as editor destroyed), the ability to directly revoke the storage api
    // And when the user loads a plug-in, it can also remind the user what kind of capabilities the plug-in may use
    // getCapability: () => Capability[];
    new (affine: Virgo, hooks: PluginHooks): Plugin;
}

// plugin management
export interface PluginManagerInterface {
    /** register plugin to editor */
    register: (plugin: PluginCreator) => void;
    deregister: (pluginName: string) => void;
    getPlugin: (pluginName: string) => Plugin | undefined;

    /** listen to event name, exec async listener callback */
    observe(
        name: string,
        callback: (
            ...args: Array<any>
        ) => Promise<Record<string, unknown>> | void
    ): void;
    unobserve(
        name: string,
        callback: (
            ...args: Array<any>
        ) => Promise<Record<string, unknown>> | void
    ): void;
    /** fire event name, and collect all results of listeners */
    emitAsync(name: string, ...params: Array<any>): Promise<any[]>;
    emit(name: string, ...params: Array<any>): void;
}

export enum HookType {
    INIT = 'init',
    RENDER = 'render',
    ON_ROOT_NODE_KEYUP = 'onRootNodeKeyUp',
    ON_ROOTNODE_MOUSE_DOWN = 'onRootNodeMouseDown',
    ON_ROOT_NODE_KEYDOWN = 'onRootNodeKeyDown',
    ON_ROOT_NODE_KEYDOWN_CAPTURE = 'onRootNodeKeyDownCapture',
    ON_ROOTNODE_MOUSE_MOVE = 'onRootNodeMouseMove',
    ON_ROOTNODE_MOUSE_UP = 'onRootNodeMouseUp',
    ON_ROOTNODE_MOUSE_OUT = 'onRootNodeMouseOut',
    ON_ROOTNODE_MOUSE_LEAVE = 'onRootNodeMouseLeave',
    ON_SEARCH = 'onSearch',
    AFTER_ON_RESIZE = 'afterOnResize',
    ON_ROOTNODE_DRAG_OVER = 'onRootNodeDragOver',
    ON_ROOTNODE_DRAG_LEAVE = 'onRootNodeDragLeave',
    ON_ROOTNODE_DRAG_END = 'onRootNodeDragEnd',
    ON_ROOTNODE_DRAG_OVER_CAPTURE = 'onRootNodeDragOverCapture',
    ON_ROOTNODE_DROP = 'onRootNodeDrop',
    AFTER_ON_NODE_DRAG_OVER = 'afterOnNodeDragOver',
    BEFORE_COPY = 'beforeCopy',
    BEFORE_CUT = 'beforeCut',
    ON_ROOTNODE_SCROLL = 'onRootNodeScroll',
}

export interface BlockDomInfo {
    blockId: string;
    dom: HTMLElement;
    type: BlockFlavorKeys;
    rect: DOMRect;
    properties: Record<string, unknown>;
}

// Editor's various callbacks, used in Editor
export interface HooksRunner {
    init: () => void;
    render: () => void;
    onRootNodeKeyUp: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    onRootNodeKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    onRootNodeKeyDownCapture: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    onRootNodeMouseDown: (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => void;
    onRootNodeMouseMove: (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => void;
    onRootNodeMouseUp: (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => void;
    onRootNodeMouseOut: (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => void;
    onRootNodeMouseLeave: (
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ) => void;
    onSearch: () => void;
    afterOnResize: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    onRootNodeDragOver: (e: React.DragEvent<Element>) => void;
    onRootNodeDragEnd: (e: React.DragEvent<Element>) => void;
    onRootNodeDragLeave: (e: React.DragEvent<Element>) => void;
    onRootNodeDrop: (e: React.DragEvent<Element>) => void;
    afterOnNodeDragOver: (
        e: React.DragEvent<Element>,
        node: BlockDomInfo
    ) => void;
    beforeCopy: (e: ClipboardEvent) => void;
    beforeCut: (e: ClipboardEvent) => void;
    onRootNodeScroll: (e: React.UIEvent) => void;
}

export type PayloadType<T extends Array<any>> = T extends []
    ? void
    : T extends [infer U]
    ? U
    : T;

export interface PluginHooks {
    get<K extends keyof HooksRunner>(
        key: K
    ): Observable<PayloadType<Parameters<HooksRunner[K]>>>;
}

export * from './drag-drop/types';
