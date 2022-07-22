import createVanilla, { StoreApi } from 'zustand/vanilla';
import create, { UseBoundStore } from 'zustand';
import * as idb from 'idb-keyval';
import { deepCopy } from './deep-copy';
import type { Patch, Command } from '@toeverything/components/board-types';
import { Utils } from '@tldraw/core';

export class StateManager<T extends Record<string, any>> {
    /**
     * An ID used to persist state in indexdb.
     */
    protected idb_id?: string;

    /**
     * The initial state.
     */
    private initial_state: T;

    /**
     * A zustand store that also holds the state.
     */
    private store: StoreApi<T>;

    /**
     * The index of the current command.
     */
    protected pointer = -1;

    /**
     * The current state.
     */
    private _state: T;

    /**
     * The state manager's current status, with regard to restoring persisted state.
     */
    private _status: 'loading' | 'ready' = 'loading';

    /**
     * A stack of commands used for history (undo and redo).
     */
    protected stack: Command<T>[] = [];

    /**
     * A snapshot of the current state.
     */
    protected _snapshot: T;

    /* eslint-disable @typescript-eslint/naming-convention */
    /**
     * A React hook for accessing the zustand store.
     */
    public readonly useStore: UseBoundStore<T>;
    /* eslint-enable @typescript-eslint/naming-convention */

    /**
     * A promise that will resolve when the state manager has loaded any peristed state.
     */
    public ready: Promise<'none' | 'restored' | 'migrated'>;

    public isPaused = false;

    constructor(
        initialState: T,
        id?: string,
        version?: number,
        update?: (prev: T, next: T, prevVersion: number) => T
    ) {
        this.idb_id = id;
        this._state = deepCopy(initialState);
        this._snapshot = deepCopy(initialState);
        this.initial_state = deepCopy(initialState);
        this.store = createVanilla(() => this._state);
        this.useStore = create(this.store);

        this.ready = new Promise<'none' | 'restored' | 'migrated'>(resolve => {
            let message: 'none' | 'restored' | 'migrated' = 'none';

            if (this.idb_id) {
                message = 'restored';

                idb.get(this.idb_id)
                    .then(async saved => {
                        if (saved) {
                            let next = saved;

                            if (version) {
                                const savedVersion = await idb.get<number>(
                                    id + '_version'
                                );

                                if (savedVersion && savedVersion < version) {
                                    next = update
                                        ? update(
                                              saved,
                                              initialState,
                                              savedVersion
                                          )
                                        : initialState;

                                    message = 'migrated';
                                }
                            }

                            await idb.set(id + '_version', version || -1);

                            // why is this necessary? but it is...
                            const prevEmpty =
                                this._state['appState'].isEmptyCanvas;

                            next = this.migrate(next);

                            this._state = deepCopy(next);
                            this._snapshot = deepCopy(next);

                            this._state['appState'].isEmptyCanvas = prevEmpty;
                            this.store.setState(this._state, true);
                        } else {
                            await idb.set(id + '_version', version || -1);
                        }
                        this._status = 'ready';
                        resolve(message);
                    })
                    .catch(e => console.error(e));
            } else {
                // We need to wait for any override to `onReady` to take effect.
                this._status = 'ready';
                resolve(message);
            }
        }).then(message => {
            if (this.on_ready) this.on_ready(message);
            return message;
        });
    }

    /**
     * Save the current state to indexdb.
     */
    protected persist = (id?: string): void | Promise<void> => {
        if (this._status !== 'ready') return;

        if (this.onPersist) {
            this.onPersist(this._state, id);
        }

        if (this.idb_id) {
            return idb
                .set(this.idb_id, this._state)
                .catch(e => console.error(e));
        }
    };

    /**
     * Apply a patch to the current state.
     * This does not effect the undo/redo stack.
     * This does not persist the state.
     * @param patch The patch to apply.
     * @param id (optional) An id for the patch.
     */
    private apply_patch = (patch: Patch<T>, id?: string) => {
        const prev = this._state;
        const next = Utils.deepMerge(this._state, patch as any);
        const final = this.cleanup(next, prev, patch, id);
        if (this.on_state_will_change) {
            this.on_state_will_change(final, id);
        }
        this._state = final;
        this.store.setState(this._state, true);
        if (this.on_state_did_change) {
            this.on_state_did_change(this._state, id);
        }
        return this;
    };

    // Internal API ---------------------------------

    protected migrate = (next: T): T => {
        return next;
    };

    /**
     * Perform any last changes to the state before updating.
     * Override this on your extending class.
     * @param nextState The next state.
     * @param prevState The previous state.
     * @param patch The patch that was just applied.
     * @param id (optional) An id for the just-applied patch.
     * @returns The final new state to apply.
     */
    protected cleanup = (
        nextState: T,
        prevState: T,
        patch: Patch<T>,
        id?: string
    ): T => nextState;

    /**
     * A life-cycle method called when the state is about to change.
     * @param state The next state.
     * @param id An id for the change.
     */
    protected on_state_will_change?: (state: T, id?: string) => void;

    /**
     * A life-cycle method called when the state has changed.
     * @param state The next state.
     * @param id An id for the change.
     */
    protected on_state_did_change?: (state: T, id?: string) => void;

    /**
     * Apply a patch to the current state.
     * This does not effect the undo/redo stack.
     * This does not persist the state.
     * @param patch The patch to apply.
     * @param id (optional) An id for this patch.
     */
    patchState = (patch: Patch<T>, id?: string): this => {
        this.apply_patch(patch, id);
        if (this.onPatch) {
            this.onPatch(this._state, id);
        }
        return this;
    };

    /**
     * Replace the current state.
     * This does not effect the undo/redo stack.
     * This does not persist the state.
     * @param state The new state.
     * @param id An id for this change.
     */
    protected replace_state = (state: T, id?: string): this => {
        const final = this.cleanup(state, this._state, state, id);
        if (this.on_state_will_change) {
            this.on_state_will_change(final, 'replace');
        }
        this._state = final;
        this.store.setState(this._state, true);
        if (this.on_state_did_change) {
            this.on_state_did_change(this._state, 'replace');
        }
        return this;
    };

    /**
     * Update the state using a Command.
     * This effects the undo/redo stack.
     * This persists the state.
     * @param command The command to apply and add to the undo/redo stack.
     * @param id (optional) An id for this command.
     */
    protected set_state = (command: Command<T>, id = command.id) => {
        if (this.pointer < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.pointer + 1);
        }
        this.stack.push({ ...command, id });
        this.pointer = this.stack.length - 1;
        this.apply_patch(command.after, id);
        if (this.onCommand) this.onCommand(this._state, id);
        this.persist(id);
        return this;
    };

    // Public API ---------------------------------

    public pause() {
        this.isPaused = true;
    }

    public resume() {
        this.isPaused = false;
    }

    /**
     * A callback fired when the constructor finishes loading any
     * persisted data.
     */
    protected on_ready?: (message: 'none' | 'restored' | 'migrated') => void;

    /**
     * A callback fired when a patch is applied.
     */
    public onPatch?: (state: T, id?: string) => void;

    /**
     * A callback fired when a patch is applied.
     */
    public onCommand?: (state: T, id?: string) => void;

    /**
     * A callback fired when the state is persisted.
     */
    public onPersist?: (state: T, id?: string) => void;

    /**
     * A callback fired when the state is replaced.
     */
    public onReplace?: (state: T) => void;

    /**
     * A callback fired when the state is reset.
     */
    public onReset?: (state: T) => void;

    /**
     * A callback fired when the history is reset.
     */
    public onResetHistory?: (state: T) => void;

    /**
     * A callback fired when a command is undone.
     */
    public onUndo?: (state: T) => void;

    /**
     * A callback fired when a command is redone.
     */
    public onRedo?: (state: T) => void;

    /**
     * Reset the state to the initial state and reset history.
     */
    public reset = () => {
        if (this.on_state_will_change) {
            this.on_state_will_change(this.initial_state, 'reset');
        }
        this._state = this.initial_state;
        this.store.setState(this._state, true);
        this.resetHistory();
        this.persist('reset');
        if (this.on_state_did_change) {
            this.on_state_did_change(this._state, 'reset');
        }
        if (this.onReset) {
            this.onReset(this._state);
        }
        return this;
    };

    /**
     * Force replace a new undo/redo history. It's your responsibility
     * to make sure that this is compatible with the current state!
     * @param history The new array of commands.
     * @param pointer (optional) The new pointer position.
     */
    public replaceHistory = (
        history: Command<T>[],
        pointer = history.length - 1
    ): this => {
        this.stack = history;
        this.pointer = pointer;
        if (this.onReplace) {
            this.onReplace(this._state);
        }
        return this;
    };

    /**
     * Reset the history stack (without resetting the state).
     */
    public resetHistory = (): this => {
        this.stack = [];
        this.pointer = -1;
        if (this.onResetHistory) {
            this.onResetHistory(this._state);
        }
        return this;
    };

    /**
     * Move backward in the undo/redo stack.
     */
    public undo = (): this => {
        if (!this.isPaused) {
            if (!this.canUndo) return this;
            const command = this.stack[this.pointer];
            this.pointer--;
            this.apply_patch(command.before, `undo`);
            this.persist('undo');
        }
        if (this.onUndo) this.onUndo(this._state);
        return this;
    };

    /**
     * Move forward in the undo/redo stack.
     */
    public redo = (): this => {
        if (!this.isPaused) {
            if (!this.canRedo) return this;
            this.pointer++;
            const command = this.stack[this.pointer];
            this.apply_patch(command.after, 'redo');
            this.persist('undo');
        }
        if (this.onRedo) this.onRedo(this._state);
        return this;
    };

    /**
     * Save a snapshot of the current state, accessible at `this.snapshot`.
     */
    public setSnapshot = (): this => {
        this._snapshot = { ...this._state };
        return this;
    };

    /**
     * Force the zustand state to update.
     */
    public forceUpdate = () => {
        this.store.setState(this._state, true);
    };

    /**
     * Get whether the state manager can undo.
     */
    public get canUndo(): boolean {
        return this.pointer > -1;
    }

    /**
     * Get whether the state manager can redo.
     */
    public get canRedo(): boolean {
        return this.pointer < this.stack.length - 1;
    }

    /**
     * The current state.
     */
    public get state(): T {
        return this._state;
    }

    /**
     * The current status.
     */
    public get status(): string {
        return this._status;
    }

    /**
     * The most-recent snapshot.
     */
    protected get snapshot(): T {
        return this._snapshot;
    }
}
