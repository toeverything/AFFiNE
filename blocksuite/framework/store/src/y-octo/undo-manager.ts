import type {
  SessionCommit,
  SessionTxOrigin,
  TypeTarget,
} from '@blocksuite/sync/y-octo';

import {
  decodeMetaBytes,
  encodeMetaBytes,
  Y_OCTO_UNDO_ORIGIN,
  type YOctoSpaceAdapter,
} from './space-adapter.js';

export type YOctoUndoEventName =
  | 'stack-item-added'
  | 'stack-item-popped'
  | 'stack-item-updated'
  | 'stack-cleared';

export interface YOctoStackItemEvent {
  stackItem: {
    meta: Map<string, unknown>;
  };
  type: 'undo' | 'redo';
  origin?: unknown;
}

type AnyListener = (...args: any[]) => void;

export interface YOctoUndoManagerOptions {
  captureTimeout?: number;
  trackedOrigins?: SessionTxOrigin[];
}

export class YOctoUndoManager {
  readonly stackId: number;
  private readonly listeners = new Map<YOctoUndoEventName, Set<AnyListener>>();
  private readonly unsubscribeCommit: () => void;
  private destroyed = false;

  constructor(
    private readonly adapter: YOctoSpaceAdapter,
    scopes: TypeTarget[],
    options: YOctoUndoManagerOptions = {}
  ) {
    const captureTimeoutMs = options.captureTimeout ?? 500;
    const trackedOrigins: SessionTxOrigin[] = options.trackedOrigins ?? [
      'Tracked',
    ];
    this.stackId = adapter.session.createUndoStack(
      scopes,
      captureTimeoutMs,
      trackedOrigins
    );
    this.unsubscribeCommit = adapter.onAfterCommit(this._onAfterCommit);
  }

  private _createPersistingMetaMap(
    stack: 'Undo' | 'Redo',
    initial?: Record<string, unknown>
  ): Map<string, unknown> {
    const map = new Map<string, unknown>(
      initial ? Object.entries(initial) : undefined
    );
    const persist = () => {
      if (this.destroyed || this.adapter.session.isDestroyed) return;
      const obj: Record<string, unknown> = {};
      for (const [k, v] of map.entries()) {
        obj[k] = v;
      }
      try {
        this.adapter.session.setStackSelectionMeta(
          this.stackId,
          stack,
          encodeMetaBytes(obj)
        );
      } catch {
        // Ignore if stack is empty or destroyed
      }
    };
    const origSet = map.set.bind(map);
    const origDelete = map.delete.bind(map);
    map.set = (key: string, value: unknown) => {
      origSet(key, value);
      persist();
      return map;
    };
    map.delete = (key: string) => {
      const res = origDelete(key);
      if (res) persist();
      return res;
    };
    return map;
  }

  private readonly _onAfterCommit = (
    commit: SessionCommit,
    origin: unknown
  ) => {
    if (this.destroyed) return;
    const kind = commit.origin_kind;
    if (typeof kind === 'object' && 'Undo' in kind) {
      if (kind.Undo.stack_id === this.stackId) {
        const meta = this._decodeMeta(commit.selection_meta);
        this._emit('stack-item-popped', {
          stackItem: { meta },
          type: 'undo',
          origin,
        });
      }
      return;
    }
    if (typeof kind === 'object' && 'Redo' in kind) {
      if (kind.Redo.stack_id === this.stackId) {
        const meta = this._decodeMeta(commit.selection_meta);
        this._emit('stack-item-popped', {
          stackItem: { meta },
          type: 'redo',
          origin,
        });
      }
      return;
    }
    if (commit.is_local && kind === 'LocalTransact') {
      const meta = this._createPersistingMetaMap('Undo');
      this._emit('stack-item-added', {
        stackItem: { meta },
        type: 'undo',
        origin,
      });
    }
  };

  private _decodeMeta(bytes: Uint8Array | null): Map<string, unknown> {
    if (!bytes || bytes.length === 0) {
      return new Map();
    }
    try {
      const parsed = decodeMetaBytes(bytes);
      if (parsed && typeof parsed === 'object') {
        return new Map(Object.entries(parsed as Record<string, unknown>));
      }
    } catch {
      // ignore malformed meta
    }
    return new Map();
  }

  private _emit(event: YOctoUndoEventName, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      fn(...args);
    }
  }

  on<T extends AnyListener>(event: YOctoUndoEventName, listener: T): T {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return listener;
  }

  off(event: YOctoUndoEventName, listener: AnyListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  canUndo(): boolean {
    if (this.destroyed || this.adapter.session.isDestroyed) return false;
    return this.adapter.session.canUndoStack(this.stackId);
  }

  canRedo(): boolean {
    if (this.destroyed || this.adapter.session.isDestroyed) return false;
    return this.adapter.session.canRedoStack(this.stackId);
  }

  undo(): unknown {
    if (this.destroyed || this.adapter.session.isDestroyed) return null;
    return this.adapter.session.undoStack(this.stackId, Y_OCTO_UNDO_ORIGIN);
  }

  redo(): unknown {
    if (this.destroyed || this.adapter.session.isDestroyed) return null;
    return this.adapter.session.redoStack(this.stackId, Y_OCTO_UNDO_ORIGIN);
  }

  stopCapturing(): void {
    if (this.destroyed || this.adapter.session.isDestroyed) return;
    this.adapter.session.stopCapturingStack(this.stackId);
  }

  clear(clearUndoStack = true, clearRedoStack = true): void {
    if (this.destroyed || this.adapter.session.isDestroyed) return;
    this.adapter.session.clearStackHistory(
      this.stackId,
      clearUndoStack,
      clearRedoStack
    );
    this._emit('stack-cleared', {
      undoStackCleared: clearUndoStack,
      redoStackCleared: clearRedoStack,
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeCommit();
    this.listeners.clear();
    if (!this.adapter.session.isDestroyed) {
      this.adapter.session.destroyUndoStack(this.stackId);
    }
  }
}
