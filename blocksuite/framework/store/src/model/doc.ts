import type { Subject } from 'rxjs';
import type * as Y from 'yjs';

import type { AwarenessStore } from '../yjs/awareness.js';
import type { YBlock } from './block/types.js';
import type { Query } from './store/query.js';
import type { Store, StoreOptions } from './store/store.js';
import type { Workspace } from './workspace.js';
import type { DocMeta } from './workspace-meta.js';

export type GetBlocksOptions = Omit<StoreOptions, 'schema' | 'doc'>;
export type CreateBlocksOptions = GetBlocksOptions & {
  id?: string;
};
export type YBlocks = Y.Map<YBlock>;

export interface Doc {
  readonly id: string;
  get meta(): DocMeta | undefined;

  remove(): void;
  load(initFn?: () => void): void;
  get ready(): boolean;
  dispose(): void;

  slots: {
    /**
     * This fires when the doc history is updated.
     */
    historyUpdated: Subject<void>;
    /**
     * @internal
     * This fires when the doc yBlock is updated.
     */
    yBlockUpdated: Subject<{
      type: 'add' | 'delete';
      id: string;
      isLocal: boolean;
    }>;
  };

  get history(): Y.UndoManager;
  get canRedo(): boolean;
  get canUndo(): boolean;
  undo(): void;
  redo(): void;
  resetHistory(): void;
  transact(fn: () => void, shouldTransact?: boolean): void;
  withoutTransact(fn: () => void): void;

  captureSync(): void;
  clear(): void;
  getStore(options?: GetBlocksOptions): Store;
  clearQuery(query: Query, readonly?: boolean): void;

  get loaded(): boolean;
  get awarenessStore(): AwarenessStore;

  get workspace(): Workspace;

  get rootDoc(): Y.Doc;
  get spaceDoc(): Y.Doc;
  get yBlocks(): Y.Map<YBlock>;
}
