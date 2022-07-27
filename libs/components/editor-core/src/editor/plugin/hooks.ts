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
    private _hooksMap: Map<string, PluginHookInfo[]> = new Map();

    dispose() {
        this._hooksMap.clear();
    }

    private _runHook(key: HookType, ...params: unknown[]): void {
        const hookInfos: PluginHookInfo[] = this._hooksMap.get(key) || [];
        hookInfos.forEach(hookInfo => {
            if (hookInfo.once) {
                this.removeHook(key, hookInfo.callback);
            }
            let isStoppedPropagation = false;
            const hookOption: HookBaseArgs = {
                stopImmediatePropagation: () => {
                    isStoppedPropagation = true;
                },
            };
            hookInfo.callback.call(
                hookInfo.thisObj || this,
                ...params,
                hookOption
            );
            return isStoppedPropagation;
        });
    }

    private _hasHook(key: HookType, callback: AnyFunction): boolean {
        const hookInfos: PluginHookInfo[] = this._hooksMap.get(key) || [];
        for (let i = hookInfos.length - 1; i >= 0; i--) {
            if (hookInfos[i].callback === callback) {
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
        if (this._hasHook(key, callback)) {
            throw new Error('Duplicate registration of the same class');
        }
        if (!this._hooksMap.has(key)) {
            this._hooksMap.set(key, []);
        }
        const hookInfos: PluginHookInfo[] = this._hooksMap.get(key);
        hookInfos.push({ callback, thisObj, once });
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
        const hookInfos: PluginHookInfo[] = this._hooksMap.get(key) || [];
        for (let i = hookInfos.length - 1; i >= 0; i--) {
            if (hookInfos[i].callback === callback) {
                hookInfos.splice(i, 1);
            }
        }
    }

    public init(): void {
        this._runHook(HookType.INIT);
    }

    public render(): void {
        this._runHook(HookType.RENDER);
    }

    public onRootNodeKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
        this._runHook(HookType.ON_ROOT_NODE_KEYDOWN, e);
    }

    public onRootNodeKeyDownCapture(
        e: React.KeyboardEvent<HTMLDivElement>
    ): void {
        this._runHook(HookType.ON_ROOT_NODE_KEYDOWN_CAPTURE, e);
    }

    public onRootNodeKeyUp(e: React.KeyboardEvent<HTMLDivElement>): void {
        this._runHook(HookType.ON_ROOT_NODE_KEYUP, e);
    }

    public onRootNodeMouseDown(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this._runHook(HookType.ON_ROOTNODE_MOUSE_DOWN, e);
    }

    public onRootNodeMouseMove(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this._runHook(HookType.ON_ROOTNODE_MOUSE_MOVE, e);
    }

    public onRootNodeMouseUp(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this._runHook(HookType.ON_ROOTNODE_MOUSE_UP, e);
    }

    public onRootNodeMouseOut(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this._runHook(HookType.ON_ROOTNODE_MOUSE_OUT, e);
    }

    public onRootNodeMouseLeave(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this._runHook(HookType.ON_ROOTNODE_MOUSE_LEAVE, e);
    }

    public afterOnNodeMouseMove(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>,
        node: BlockDomInfo
    ): void {
        this._runHook(HookType.AFTER_ON_NODE_MOUSE_MOVE, e, node);
    }

    public afterOnResize(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this._runHook(HookType.AFTER_ON_RESIZE, e);
    }

    public onRootNodeDragOver(e: React.DragEvent<Element>): void {
        this._runHook(HookType.ON_ROOTNODE_DRAG_OVER, e);
    }

    public onRootNodeDragEnd(e: React.DragEvent<Element>): void {
        this._runHook(HookType.ON_ROOTNODE_DRAG_END, e);
    }

    public onRootNodeDrop(e: React.DragEvent<Element>): void {
        this._runHook(HookType.ON_ROOTNODE_DROP, e);
    }

    public onRootNodeDragOverCapture(e: React.DragEvent<Element>): void {
        this._runHook(HookType.ON_ROOTNODE_DRAG_OVER_CAPTURE, e);
    }

    public afterOnNodeDragOver(
        e: React.DragEvent<Element>,
        node: BlockDomInfo
    ): void {
        this._runHook(HookType.AFTER_ON_NODE_DRAG_OVER, e, node);
    }

    public onSearch(): void {
        this._runHook(HookType.ON_SEARCH);
    }

    public beforeCopy(e: ClipboardEvent): void {
        this._runHook(HookType.BEFORE_COPY, e);
    }

    public beforeCut(e: ClipboardEvent): void {
        this._runHook(HookType.BEFORE_CUT, e);
    }
}
