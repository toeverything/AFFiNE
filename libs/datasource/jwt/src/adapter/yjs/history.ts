import { Map as YMap, UndoManager } from 'yjs';

import { HistoryCallback, HistoryManager } from '../../adapter';

type StackItem = UndoManager['undoStack'][0];

export class YjsHistoryManager implements HistoryManager {
    readonly #blocks: YMap<any>;
    readonly #history_manager: UndoManager;
    readonly #push_listeners: Map<string, HistoryCallback<any>>;
    readonly #pop_listeners: Map<string, HistoryCallback<any>>;

    constructor(scope: YMap<any>, tracker?: any[]) {
        this.#blocks = scope;
        this.#history_manager = new UndoManager(scope, {
            trackedOrigins: tracker ? new Set(tracker) : undefined,
        });

        this.#push_listeners = new Map();
        this.#history_manager.on(
            'stack-item-added',
            (event: { stackItem: StackItem }) => {
                const meta = event.stackItem.meta;
                for (const listener of this.#push_listeners.values()) {
                    listener(meta);
                }
            }
        );

        this.#pop_listeners = new Map();
        this.#history_manager.on(
            'stack-item-popped',
            (event: { stackItem: StackItem }) => {
                const meta = event.stackItem.meta;
                for (const listener of this.#pop_listeners.values()) {
                    listener(new Map(meta));
                }
            }
        );
    }

    onPush<T = unknown>(name: string, callback: HistoryCallback<T>): void {
        this.#push_listeners.set(name, callback);
    }

    offPush(name: string): boolean {
        return this.#push_listeners.delete(name);
    }

    onPop<T = unknown>(name: string, callback: HistoryCallback<T>): void {
        this.#pop_listeners.set(name, callback);
    }

    offPop(name: string): boolean {
        return this.#pop_listeners.delete(name);
    }

    break(): void {
        // this.#history_manager.
    }

    undo<T = unknown>(): Map<string, T> | undefined {
        return this.#history_manager.undo()?.meta;
    }

    redo<T = unknown>(): Map<string, T> | undefined {
        return this.#history_manager.redo()?.meta;
    }

    clear(): void {
        return this.#history_manager.clear();
    }
}
