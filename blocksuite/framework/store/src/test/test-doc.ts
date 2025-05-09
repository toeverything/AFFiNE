import * as Y from 'yjs';

import type { Doc, GetStoreOptions, Workspace } from '../extension/index.js';
import type { YBlock } from '../model/block/types.js';
import { StoreContainer } from '../model/index.js';
import type { AwarenessStore } from '../yjs/index.js';
import type { TestWorkspace } from './test-workspace.js';

type DocOptions = {
  id: string;
  collection: Workspace;
  doc: Y.Doc;
  awarenessStore: AwarenessStore;
};

export class TestDoc implements Doc {
  private readonly _collection: Workspace;

  private readonly _storeContainer: StoreContainer;

  private readonly _initSubDoc = () => {
    let subDoc = this.rootDoc.getMap('spaces').get(this.id);
    if (!subDoc) {
      subDoc = new Y.Doc({
        guid: this.id,
      });
      this.rootDoc.getMap('spaces').set(this.id, subDoc);
      this._loaded = true;
    } else {
      this._loaded = false;
      this.rootDoc.on('subdocs', this._onSubdocEvent);
    }

    return subDoc;
  };

  private _loaded!: boolean;

  private readonly _onSubdocEvent = ({
    loaded,
  }: {
    loaded: Set<Y.Doc>;
  }): void => {
    const result = Array.from(loaded).find(
      doc => doc.guid === this._ySpaceDoc.guid
    );
    if (!result) {
      return;
    }
    this.rootDoc.off('subdocs', this._onSubdocEvent);
    this._loaded = true;
  };

  /** Indicate whether the block tree is ready */
  private _ready = false;

  protected readonly _yBlocks: Y.Map<YBlock>;

  /**
   * @internal Used for convenient access to the underlying Yjs map,
   * can be used interchangeably with ySpace
   */
  protected readonly _ySpaceDoc: Y.Doc;

  readonly awarenessStore: AwarenessStore;

  readonly id: string;

  readonly rootDoc: Y.Doc;

  get blobSync() {
    return this.workspace.blobSync;
  }

  get workspace() {
    return this._collection;
  }

  get isEmpty() {
    return this._yBlocks.size === 0;
  }

  get loaded() {
    return this._loaded;
  }

  get meta() {
    return this.workspace.meta.getDocMeta(this.id);
  }

  get ready() {
    return this._ready;
  }

  get spaceDoc() {
    return this._ySpaceDoc;
  }

  get yBlocks() {
    return this._yBlocks;
  }

  constructor({ id, collection, doc, awarenessStore }: DocOptions) {
    this.id = id;
    this.rootDoc = doc;
    this.awarenessStore = awarenessStore;

    this._ySpaceDoc = this._initSubDoc() as Y.Doc;

    this._yBlocks = this._ySpaceDoc.getMap('blocks');
    this._collection = collection;
    this._storeContainer = new StoreContainer(this);
  }

  clear() {
    this._yBlocks.clear();
  }

  get removeStore() {
    return this._storeContainer.removeStore;
  }

  private _destroy() {
    this._ySpaceDoc.destroy();
    this._loaded = false;
  }

  dispose() {
    if (this.ready) {
      this._yBlocks.clear();
    }
  }

  getStore({
    readonly,
    query,
    provider,
    extensions,
    id,
  }: GetStoreOptions = {}) {
    const storeExtensions = (
      this.workspace as TestWorkspace
    ).storeExtensions.concat(extensions ?? []);

    let storeId: string | undefined;

    if (id) {
      storeId = id;
    } else if (readonly !== undefined || query) {
      storeId = id;
    } else {
      storeId = this.spaceDoc.guid;
    }

    return this._storeContainer.getStore({
      id: storeId,
      readonly,
      query,
      provider,
      extensions: storeExtensions,
    });
  }

  load(initFn?: () => void): this {
    if (this.ready) {
      return this;
    }

    this._ySpaceDoc.load();

    initFn?.();

    this._ready = true;

    return this;
  }

  remove() {
    this._destroy();
    this.rootDoc.getMap('spaces').delete(this.id);
  }
}
