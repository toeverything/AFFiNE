import { createIdentifier } from '@blocksuite/global/di';
import type * as Y from 'yjs';

import type { Store, StoreOptions, YBlock } from '../../model';
import type { AwarenessStore } from '../../yjs';
import type { Workspace } from './workspace.js';
import type { DocMeta } from './workspace-meta.js';

export type GetStoreOptions = Omit<StoreOptions, 'schema' | 'doc'>;
export type RemoveStoreOptions = Pick<
  StoreOptions,
  'query' | 'id' | 'readonly'
>;

export interface Doc {
  readonly id: string;
  get meta(): DocMeta | undefined;

  remove(): void;
  load(initFn?: () => void): void;
  get ready(): boolean;
  dispose(): void;

  clear(): void;
  getStore(options?: GetStoreOptions): Store;
  removeStore(options: RemoveStoreOptions): void;

  get loaded(): boolean;
  get awarenessStore(): AwarenessStore;

  get workspace(): Workspace;

  get rootDoc(): Y.Doc;
  get spaceDoc(): Y.Doc;
  get yBlocks(): Y.Map<YBlock>;
}

export const DocIdentifier = createIdentifier<Doc>('store-doc');
