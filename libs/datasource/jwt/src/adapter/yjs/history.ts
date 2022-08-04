import { Map as YMap, UndoManager } from 'yjs';

import { HistoryCallback, HistoryManager } from '../../adapter';

type StackItem = UndoManager['undoStack'][0];

export class YjsHistoryManager implements HistoryManager {
    readonly _blocks: YMap<any>;
    readonly _historyManager: UndoManager;
    readonly _pushListeners: Map<string, HistoryCallback<any>>;
    readonly _popListeners: Map<string, HistoryCallback<any>>;

    constructor(scope: YMap<any>, tracker?: any[]) {
        this._blocks = scope;
        this._historyManager = new UndoManager(scope, {
            trackedOrigins: tracker ? new Set(tracker) : undefined,
        });

        this._pushListeners = new Map();
        this._historyManager.on(
            'stack-item-added',
            (event: { stackItem: StackItem }) => {
                const meta = event.stackItem.meta;
                for (const listener of this._pushListeners.values()) {
                    listener(meta);
                }
            }
        );

        this._popListeners = new Map();
        this._historyManager.on(
            'stack-item-popped',
            (event: { stackItem: StackItem }) => {
                const meta = event.stackItem.meta;
                for (const listener of this._popListeners.values()) {
                    listener(new Map(meta));
                }
            }
        );
    }

    onPush<T = unknown>(name: string, callback: HistoryCallback<T>): void {
        this._pushListeners.set(name, callback);
    }

    offPush(name: string): boolean {
        return this._pushListeners.delete(name);
    }

    onPop<T = unknown>(name: string, callback: HistoryCallback<T>): void {
        this._popListeners.set(name, callback);
    }

    offPop(name: string): boolean {
        return this._popListeners.delete(name);
    }

    break(): void {
        // this.#history_manager.
    }

    undo<T = unknown>(): Map<string, T> | undefined {
        return this._historyManager.undo()?.meta;
    }

    redo<T = unknown>(): Map<string, T> | undefined {
        return this._historyManager.redo()?.meta;
    }

    clear(): void {
        return this._historyManager.clear();
    }
}
