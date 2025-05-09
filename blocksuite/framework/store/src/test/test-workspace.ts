import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { NoopLogger } from '@blocksuite/global/utils';
import {
  AwarenessEngine,
  type AwarenessSource,
  BlobEngine,
  type BlobSource,
  DocEngine,
  type DocSource,
  MemoryBlobSource,
  NoopDocSource,
} from '@blocksuite/sync';
import { Subject } from 'rxjs';
import { Awareness } from 'y-protocols/awareness.js';
import * as Y from 'yjs';

import type {
  Doc,
  ExtensionType,
  Workspace,
  WorkspaceMeta,
} from '../extension/index.js';
import { type IdGenerator, nanoid } from '../utils/id-generator.js';
import { AwarenessStore } from '../yjs/index.js';
import { TestDoc } from './test-doc.js';
import { TestMeta } from './test-meta.js';

export type DocCollectionOptions = {
  id?: string;
  idGenerator?: IdGenerator;
  docSources?: {
    main: DocSource;
    shadows?: DocSource[];
  };
  blobSources?: {
    main: BlobSource;
    shadows?: BlobSource[];
  };
  awarenessSources?: AwarenessSource[];
};

/**
 * @internal
 * Test only
 * Do not use this in production
 */
export class TestWorkspace implements Workspace {
  storeExtensions: ExtensionType[] = [];

  readonly awarenessStore: AwarenessStore;

  readonly awarenessSync: AwarenessEngine;

  readonly blobSync: BlobEngine;

  readonly blockCollections = new Map<string, TestDoc>();

  readonly doc: Y.Doc;

  readonly docSync: DocEngine;

  readonly id: string;

  readonly idGenerator: IdGenerator;

  meta: WorkspaceMeta;

  slots = {
    docListUpdated: new Subject<void>(),
  };

  get docs() {
    return this.blockCollections;
  }

  constructor({
    id,
    idGenerator,
    awarenessSources = [],
    docSources = {
      main: new NoopDocSource(),
    },
    blobSources = {
      main: new MemoryBlobSource(),
    },
  }: DocCollectionOptions = {}) {
    this.id = id || '';
    this.doc = new Y.Doc({ guid: id });
    this.awarenessStore = new AwarenessStore(new Awareness(this.doc));

    const logger = new NoopLogger();

    this.awarenessSync = new AwarenessEngine(
      this.awarenessStore.awareness,
      awarenessSources
    );
    this.docSync = new DocEngine(
      this.doc,
      docSources.main,
      docSources.shadows ?? [],
      logger
    );
    this.blobSync = new BlobEngine(
      blobSources.main,
      blobSources.shadows ?? [],
      logger
    );

    this.idGenerator = idGenerator ?? nanoid;

    this.meta = new TestMeta(this.doc);
    this._bindDocMetaEvents();
  }

  private _bindDocMetaEvents() {
    this.meta.docMetaAdded.subscribe(docId => {
      const doc = new TestDoc({
        id: docId,
        collection: this,
        doc: this.doc,
        awarenessStore: this.awarenessStore,
      });
      this.blockCollections.set(doc.id, doc);
    });

    this.meta.docMetaUpdated.subscribe(() => this.slots.docListUpdated.next());

    this.meta.docMetaRemoved.subscribe(id => {
      const space = this.getBlockCollection(id);
      if (!space) return;
      this.blockCollections.delete(id);
      space.remove();
    });
  }

  private _hasDoc(docId: string) {
    return this.docs.has(docId);
  }

  /**
   * Verify that all data has been successfully saved to the primary storage.
   * Return true if the data transfer is complete and it is secure to terminate the synchronization operation.
   */
  canGracefulStop() {
    this.docSync.canGracefulStop();
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
    return this.getDoc(id) as Doc;
  }

  dispose() {
    this.awarenessStore.destroy();
  }

  /**
   * Terminate the data sync process forcefully, which may cause data loss.
   * It is advised to invoke `canGracefulStop` before calling this method.
   */
  forceStop() {
    this.docSync.forceStop();
    this.blobSync.stop();
    this.awarenessSync.disconnect();
  }

  getBlockCollection(docId: string): TestDoc | null {
    const space = this.docs.get(docId) as TestDoc | undefined;
    return space ?? null;
  }

  getDoc(docId: string): Doc | null {
    const collection = this.getBlockCollection(docId);
    return collection;
  }

  removeDoc(docId: string) {
    const docMeta = this.meta.getDocMeta(docId);
    if (!docMeta) {
      throw new BlockSuiteError(
        ErrorCode.DocCollectionError,
        `doc meta not found: ${docId}`
      );
    }

    const blockCollection = this.getBlockCollection(docId);
    if (!blockCollection) return;

    blockCollection.dispose();
    this.meta.removeDocMeta(docId);
    this.blockCollections.delete(docId);
  }

  /**
   * Start the data sync process
   */
  start() {
    this.docSync.start();
    this.blobSync.start();
    this.awarenessSync.connect();
  }

  /**
   * Wait for all data has been successfully saved to the primary storage.
   */
  waitForGracefulStop(abort?: AbortSignal) {
    return this.docSync.waitForGracefulStop(abort);
  }

  waitForSynced() {
    return this.docSync.waitForSynced();
  }
}
