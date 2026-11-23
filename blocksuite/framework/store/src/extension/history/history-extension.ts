import { signal } from '@preact/signals-core';
import { Subject } from 'rxjs';
import * as Y from 'yjs';

import type { Store } from '../../model';
import { StoreExtension } from '../store-extension';

export class HistoryExtension extends StoreExtension {
  static override readonly key = 'history';

  private readonly _history!: Y.UndoManager;

  private readonly _canRedo = signal(false);

  private readonly _canUndo = signal(false);

  readonly onUpdated = new Subject<void>();

  constructor(store: Store) {
    super(store);

    this._history = new Y.UndoManager([this.store.doc.yBlocks], {
      trackedOrigins: new Set([this.store.doc.spaceDoc.clientID]),
    });
  }

  private readonly _updateCanUndoRedoSignals = () => {
    const canRedo = this._history.canRedo();
    const canUndo = this._history.canUndo();
    if (this._canRedo.peek() !== canRedo) {
      this._canRedo.value = canRedo;
    }
    if (this._canUndo.peek() !== canUndo) {
      this._canUndo.value = canUndo;
    }
  };

  get canRedo() {
    return this._canRedo.peek();
  }

  get canUndo() {
    return this._canUndo.peek();
  }

  get canRedo$() {
    return this._canRedo;
  }

  get canUndo$() {
    return this._canUndo;
  }

  get undoManager() {
    return this._history;
  }

  override loaded() {
    this._updateCanUndoRedoSignals();
    this._history.on('stack-cleared', this._historyObserver);
    this._history.on('stack-item-added', this._historyObserver);
    this._history.on('stack-item-popped', this._historyObserver);
    this._history.on('stack-item-updated', this._historyObserver);
  }

  private readonly _historyObserver = () => {
    this._updateCanUndoRedoSignals();
    this.onUpdated.next();
  };

  override disposed() {
    super.disposed();
    this._history.off('stack-cleared', this._historyObserver);
    this._history.off('stack-item-added', this._historyObserver);
    this._history.off('stack-item-popped', this._historyObserver);
    this._history.off('stack-item-updated', this._historyObserver);
    this.onUpdated.complete();
  }
}
