import { signal } from '@preact/signals-core';
import { Subject } from 'rxjs';
import * as Y from 'yjs';

import type { Store } from '../../model';
import { Text } from '../../reactive/text/index.js';
import {
  isYOctoSpaceDoc,
  isYOctoTextHandle,
} from '../../y-octo/space-adapter.js';
import { YOctoUndoManager } from '../../y-octo/undo-manager.js';
import { StoreExtension } from '../store-extension';

export type HistoryUndoManager = Y.UndoManager;

export function createTextUndoManager(
  text: Text | Text['yText']
): HistoryUndoManager {
  const yText = text instanceof Text ? text.yText : text;
  if (isYOctoTextHandle(yText)) {
    return new YOctoUndoManager(yText.adapter, [{ Identity: yText.identity }], {
      captureTimeout: 500,
      trackedOrigins: ['Tracked'],
    }) as unknown as Y.UndoManager;
  }
  return new Y.UndoManager(yText, {
    trackedOrigins: new Set(yText.doc ? [yText.doc.clientID] : []),
  });
}

export class HistoryExtension extends StoreExtension {
  static override readonly key = 'history';

  private readonly _history!: Y.UndoManager;

  private readonly _canRedo = signal(false);

  private readonly _canUndo = signal(false);

  readonly onUpdated = new Subject<void>();

  constructor(store: Store) {
    super(store);

    const spaceDoc = this.store.doc.spaceDoc;
    if (isYOctoSpaceDoc(spaceDoc)) {
      this._history = new YOctoUndoManager(
        spaceDoc.adapter,
        [{ Identity: { Root: 'blocks' } }],
        {
          captureTimeout: 500,
          trackedOrigins: ['Tracked'],
        }
      ) as unknown as Y.UndoManager;
    } else {
      this._history = new Y.UndoManager([this.store.doc.yBlocks], {
        trackedOrigins: new Set([spaceDoc.clientID]),
      });
    }
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
    if (this._history instanceof YOctoUndoManager) {
      this._history.destroy();
    }
    this.onUpdated.complete();
  }
}
