import type { BlobEngine } from '@blocksuite/sync';
import type { Subject } from 'rxjs';
import type { Awareness } from 'y-protocols/awareness.js';
import type * as Y from 'yjs';

import type { IdGenerator } from '../../utils/id-generator';
import type { Doc } from './doc.js';
import type { WorkspaceMeta } from './workspace-meta.js';

export interface Workspace {
  readonly id: string;
  readonly meta: WorkspaceMeta;
  readonly idGenerator: IdGenerator;
  readonly blobSync: BlobEngine;
  readonly onLoadDoc?: (doc: Y.Doc) => void;
  readonly onLoadAwareness?: (awareness: Awareness) => void;

  get doc(): Y.Doc;
  get docs(): Map<string, Doc>;

  slots: {
    docListUpdated: Subject<void>;
  };

  createDoc(docId?: string): Doc;
  getDoc(docId: string): Doc | null;
  removeDoc(docId: string): void;

  dispose(): void;
}
