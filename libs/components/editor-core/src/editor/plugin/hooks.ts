import { DragEvent } from 'react';
import { Observable, Subject } from 'rxjs';
import { HooksRunner, HookType, BlockDomInfo, PluginHooks } from '../types';

export class Hooks implements HooksRunner, PluginHooks {
    private _subject: Record<string, Subject<unknown>> = {};
    private _observable: Record<string, Observable<unknown>> = {};

    dispose() {
        this._subject = {};
    }

    private _runHook(key: HookType, ...params: unknown[]): void {
        if (this._subject[key] == null) {
            this._subject[key] = new Subject();
            this._observable[key] = this._subject[key].asObservable();
        }
        let payload: unknown = params;

        if (params.length === 0) {
            payload = undefined;
        }
        if (params.length === 1) {
            payload = params[0];
        }
        this._subject[key].next(payload);
    }

    public get<K extends keyof HooksRunner>(key: K) {
        if (this._subject[key] == null) {
            this._subject[key] = new Subject();
            this._observable[key] = this._subject[key].asObservable();
        }

        return this._observable[key] as any;
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

    public afterOnResize(
        e: React.MouseEvent<HTMLDivElement, MouseEvent>
    ): void {
        this._runHook(HookType.AFTER_ON_RESIZE, e);
    }

    public onRootNodeDragOver(e: React.DragEvent<Element>): void {
        this._runHook(HookType.ON_ROOTNODE_DRAG_OVER, e);
    }

    public onRootNodeDragLeave(e: React.DragEvent<Element>): void {
        this._runHook(HookType.ON_ROOTNODE_DRAG_LEAVE, e);
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

    public onSearch(): void {
        this._runHook(HookType.ON_SEARCH);
    }

    public beforeCopy(e: ClipboardEvent): void {
        this._runHook(HookType.BEFORE_COPY, e);
    }

    public beforeCut(e: ClipboardEvent): void {
        this._runHook(HookType.BEFORE_CUT, e);
    }

    public onRootNodeScroll(e: React.UIEvent): void {
        this._runHook(HookType.ON_ROOTNODE_SCROLL, e);
    }
}
