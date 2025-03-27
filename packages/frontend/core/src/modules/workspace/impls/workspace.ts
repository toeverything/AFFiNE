import {
  BlockSuiteError,
  ErrorCode,
} from '@blocksuite/affine/global/exceptions';
import { NoopLogger } from '@blocksuite/affine/global/utils';
import {
  type Doc,
  type IdGenerator,
  nanoid,
  type Workspace,
  type WorkspaceMeta,
} from '@blocksuite/affine/store';
import {
  BlobEngine,
  type BlobSource,
  MemoryBlobSource,
} from '@blocksuite/affine/sync';
import { Subject } from 'rxjs';
import type { Awareness } from 'y-protocols/awareness.js';
import * as Y from 'yjs';

import { DocImpl } from './doc';
import { WorkspaceMetaImpl } from './meta';

type WorkspaceOptions = {
  id?: string;
  blobSource?: BlobSource;
  onLoadDoc?: (doc: Y.Doc) => void;
  onLoadAwareness?: (awareness: Awareness) => void;
};

export class WorkspaceImpl implements Workspace {
  readonly blobSync: BlobEngine;

  readonly blockCollections = new Map<string, Doc>();

  readonly doc: Y.Doc;

  readonly id: string;

  readonly idGenerator: IdGenerator;

  meta: WorkspaceMeta;

  slots = {
    /* eslint-disable rxjs/finnish */
    docListUpdated: new Subject<void>(),
    docRemoved: new Subject<string>(),
    docCreated: new Subject<string>(),
    /* eslint-enable rxjs/finnish */
  };

  get docs() {
    return this.blockCollections;
  }

  readonly onLoadDoc?: (doc: Y.Doc) => void;
  readonly onLoadAwareness?: (awareness: Awareness) => void;

  constructor({
    id,
    blobSource,
    onLoadDoc,
    onLoadAwareness,
  }: WorkspaceOptions = {}) {
    this.id = id || '';
    this.doc = new Y.Doc({ guid: id });
    this.onLoadDoc = onLoadDoc;
    this.onLoadDoc?.(this.doc);
    this.onLoadAwareness = onLoadAwareness;

    blobSource = blobSource ?? new MemoryBlobSource();
    const logger = new NoopLogger();

    this.blobSync = new BlobEngine(blobSource, [], logger);

    this.idGenerator = nanoid;

    this.meta = new WorkspaceMetaImpl(this.doc);
    this._bindDocMetaEvents();
  }

  private _bindDocMetaEvents() {
    this.meta.docMetaAdded.subscribe(docId => {
      const doc = new DocImpl({
        id: docId,
        collection: this,
        doc: this.doc,
      });
      this.blockCollections.set(doc.id, doc);
    });

    this.meta.docMetaUpdated.subscribe(() => this.slots.docListUpdated.next());

    this.meta.docMetaRemoved.subscribe(id => {
      const doc = this._getDoc(id);
      if (!doc) return;
      this.blockCollections.delete(id);
      doc.remove();
      this.slots.docRemoved.next(id);
    });
  }

  private _hasDoc(docId: string) {
    return this.docs.has(docId);
  }

  /**
   * By default, only an empty doc will be created.
   * If the `init` parameter is passed, a `surface`, `note`, and `paragraph` block
   * will be created in the doc simultaneously.
   */
  createDoc(docId?: string): Doc {
    const id = docId ?? this.idGenerator();
    if (this._hasDoc(id)) {
      throw new BlockSuiteError(
        ErrorCode.DocCollectionError,
        'doc already exists'
      );
    }

    this.meta.addDocMeta({
      id,
      title: '',
      createDate: Date.now(),
      tags: [],
    });
    this.slots.docCreated.next(id);
    return this.getDoc(id) as Doc;
  }

  private _getDoc(docId: string): Doc | null {
    const space = this.docs.get(docId) as Doc | undefined;
    return space ?? null;
  }

  getDoc(docId: string): Doc | null {
    const doc = this._getDoc(docId);
    return doc;
  }

  removeDoc(docId: string) {
    const docMeta = this.meta.getDocMeta(docId);
    if (!docMeta) {
      throw new BlockSuiteError(
        ErrorCode.DocCollectionError,
        `doc meta not found: ${docId}`
      );
    }

    const blockCollection = this._getDoc(docId);
    if (!blockCollection) return;

    blockCollection.dispose();
    this.meta.removeDocMeta(docId);
    this.blockCollections.delete(docId);
  }

  dispose() {
    this.blockCollections.forEach(doc => doc.dispose());
  }
}
