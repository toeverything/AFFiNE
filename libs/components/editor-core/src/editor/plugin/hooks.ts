import {
    HooksRunner,
    PluginHooks,
    HookType,
    HookBaseArgs,
    BlockDomInfo,
    AnyFunction,
    AnyThisType,
} from '../types';

interface PluginHookInfo {
    thisObj?: AnyThisType;
    callback: AnyFunction;
    once: boolean;
}

export class Hooks implements HooksRunner, PluginHooks {
    private hooks_map: Map<string, PluginHookInfo[]> = new Map();

    dispose() {
        this.hooks_map.clear();
    }

    private run_hook(key: HookType, ...params: unknown[]): void {
        const hook_infos: PluginHookInfo[] = this.hooks_map.get(key) || [];
        hook_infos.forEach(hook_info => {
            if (hook_info.once) {
                this.removeHook(key, hook_info.callback);
            }
            let is_stopped_propagation = false;
            const hookOption: HookBaseArgs = {
                stopImmediatePropagation: () => {
                    is_stopped_propagation = true;
                },
            };
            hook_info.callback.call(
                hook_info.thisObj || this,
                ...params,
                hookOption
            );
            return is_stopped_propagation;
        });
    }

    private has_hook(key: HookType, callback: AnyFunction): boolean {
        const hook_infos: PluginHookInfo[] = this.hooks_map.get(key) || [];
        for (let i = hook_infos.length - 1; i >= 0; i--) {
            if (hook_infos[i].callback === callback) {
                return true;
            }
        }
        return false;
    }

    // 执行多次
    public addHook(
        key: HookType,
        callback: AnyFunction,
        thisObj?: AnyThisType,
        once?: boolean
    ): void {
        if (this.has_hook(key, callback)) {
            throw new Error('Duplicate registration of the same class');
        }
        if (!this.hooks_map.has(key)) {
            this.hooks_map.set(key, []);
        }
        const hook_infos: PluginHookInfo[] = this.hooks_map.get(key);
        hook_infos.push({ callback, thisObj, once });
    }

    // 执行一次
    public addOnceHook(
        key: HookType,
        callback: AnyFunction,
        thisObj?: AnyThisType
    ): void {
        this.addHook(key, callback, thisObj, true);
    }

    // 移除
    public removeHook(key: HookType, callback: AnyFunction): void {
        const hook_infos: PluginHookInfo[] = this.hooks_map.get(key) || [];
        for (let i = hook_infos.length - 1; i >= 0; i--) {
            if (hook_infos[i].callback === callback) {
                hook_infos.splice(i, 1);
            }
        }
    }

    public init(): void {
        this.run_hook(HookType.INIT);
    }

    public render(): void {
        this.run_hook(HookType.RENDER);
    }

    public onRootNodeKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
        this.run_hook(HookType.ON_ROOT_NODE_KEYDOWN, e);
    }

    public onRootNodeKeyDownCapture(
        e: React.KeyboardEvent<HTMLDivElement>
    ): void {
        this.run_hook(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE, e);
    }

    public onRootNodeKeyUp(e: React.KeyboardEvent<HTMLDivElement>): void {
        this.run_hook(HookType.ON_ROOT_NODE_KEYUP, e);
    }

    public onRootNodeMouseDown(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this.run_hook(HookType.ON_ROOTNODE_MOUSE_DOWN, e);
    }

    public onRootNodeMouseMove(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
        root_rect: DOMRect
    ): void {
        this.run_hook(HookType.ON_ROOTNODE_MOUSE_MOVE, e, root_rect);
    }

    public onRootNodeMouseUp(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this.run_hook(HookType.ON_ROOTNODE_MOUSE_UP, e);
    }

    public onRootNodeMouseOut(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this.run_hook(HookType.ON_ROOTNODE_MOUSE_OUT, e);
    }

    public onRootNodeMouseLeave(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this.run_hook(HookType.ON_ROOTNODE_MOUSE_LEAVE, e);
    }

    public afterOnNodeMouseMove(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
        node: BlockDomInfo
    ): void {
        this.run_hook(HookType.AFTER_ON_NODE_MOUSE_MOVE, e, node);
    }

    public afterOnResize(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this.run_hook(HookType.AFTER_ON_RESIZE, e);
    }

    public onRootNodeDragOver(
        e: React.DragEvent<Element>,
        root_rect: DOMRect
    ): void {
        this.run_hook(HookType.ON_ROOTNODE_DRAG_OVER, e, root_rect);
    }

    public onRootNodeDragEnd(
        e: React.DragEvent<Element>,
        root_rect: DOMRect
    ): void {
        this.run_hook(HookType.ON_ROOTNODE_DRAG_END, e, root_rect);
    }

    public onRootNodeDrop(e: React.DragEvent<Element>): void {
        this.run_hook(HookType.ON_ROOTNODE_DROP, e);
    }

    public onRootNodeDragOverCapture(
        e: React.DragEvent<Element>,
        root_rect: DOMRect
    ): void {
        this.run_hook(HookType.ON_ROOTNODE_DRAG_OVER_CAPTURE, e, root_rect);
    }

    public afterOnNodeDragOver(
        e: React.DragEvent<Element>,
        node: BlockDomInfo
    ): void {
        this.run_hook(HookType.AFTER_ON_NODE_DRAG_OVER, e, node);
    }

    public onSearch(): void {
        this.run_hook(HookType.ON_SEARCH);
    }

    public beforeCopy(e: ClipboardEvent): void {
        this.run_hook(HookType.BEFORE_COPY, e);
    }

    public beforeCut(e: ClipboardEvent): void {
        this.run_hook(HookType.BEFORE_CUT, e);
    }
}
