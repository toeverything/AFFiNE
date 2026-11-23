import type { WorkspaceDoc } from '@affine/nbstore';
import {
  createYProxy,
  type DocMeta,
  type DocsPropertiesMeta,
  type WorkspaceMeta,
} from '@blocksuite/affine/store';
import { Subject } from 'rxjs';
import type * as Y from 'yjs';

type MetaState = {
  pages?: unknown[];
  properties?: DocsPropertiesMeta;
  name?: string;
  avatar?: string;
};

export class WorkspaceMetaImpl implements WorkspaceMeta {
  commonFieldsUpdated = new Subject<void>();
  docMetaAdded = new Subject<string>();
  docMetaRemoved = new Subject<string>();
  docMetaUpdated = new Subject<void>();

  private readonly _handleDocCollectionMetaEvents = (
    events: Y.YEvent<Y.Array<unknown> | Y.Text | Y.Map<unknown>>[]
  ) => {
    if (
      events.some(
        e =>
          e.target === this.yDocs ||
          e.target.parent === this.yDocs ||
          (e.target === this._yMap && e.changes.keys.has('pages'))
      )
    ) {
      this._handleDocMetaEvent();
    }
    if (
      events.some(
        e =>
          e.target === this._yMap &&
          (e.changes.keys.has('name') || e.changes.keys.has('avatar'))
      )
    ) {
      this._handleCommonFieldsEvent();
    }
  };

  private readonly _id: string = 'meta';
  private readonly _doc: Y.Doc;
  private readonly _proxy: MetaState;
  private readonly _yMap: Y.Map<MetaState[keyof MetaState]>;
  private _prevDocs = new Set<string>();
  private _docMetas: DocMeta[] = [];
  private _docMetasById = new Map<string, DocMeta>();
  private inventory: WorkspaceDoc[] = [];
  private projectedTitles = new Map<string, string>();

  setProjectedTitles(titles: Record<string, string>) {
    this.projectedTitles = new Map(Object.entries(titles));
    this._handleDocMetaEvent();
  }

  setInventory(docs: WorkspaceDoc[]) {
    this.inventory = docs;
    this._handleDocMetaEvent();
  }

  get avatar() {
    return this._proxy.avatar;
  }

  setAvatar(avatar: string) {
    this._doc.transact(() => {
      this._proxy.avatar = avatar;
    }, this._doc.clientID);
  }

  get name() {
    return this._proxy.name;
  }

  setName(name: string) {
    this._doc.transact(() => {
      this._proxy.name = name;
    }, this._doc.clientID);
  }

  get properties(): DocsPropertiesMeta {
    const meta = this._proxy.properties;
    if (!meta) {
      return {
        tags: {
          options: [],
        },
      };
    }
    return meta;
  }

  setProperties(meta: DocsPropertiesMeta) {
    this._proxy.properties = meta;
    this.docMetaUpdated.next();
  }

  get docMetas(): DocMeta[] {
    return this._docMetas;
  }

  private projectDocMetas(): DocMeta[] {
    const pages = this.usesWorkspaceState
      ? this._yMap.toJSON().pages
      : this._proxy.pages;
    const metadata: unknown[] = Array.isArray(pages) ? pages : [];
    if (!this.usesWorkspaceState) return metadata as DocMeta[];
    const byId = new Map(
      metadata
        .filter(
          (meta): meta is DocMeta =>
            !!meta &&
            typeof meta === 'object' &&
            'id' in meta &&
            typeof meta.id === 'string'
        )
        .map(meta => [meta.id, meta])
    );
    return this.inventory.map(doc => {
      const metadata = byId.get(doc.docId);
      const title = typeof metadata?.title === 'string' ? metadata.title : '';
      return {
        createDate: doc.timestamp,
        tags: [],
        ...metadata,
        id: doc.docId,
        title: title || this.projectedTitles.get(doc.docId) || '',
        trash: doc.lifecycle === 'trashed',
        trashDate:
          doc.lifecycle === 'trashed'
            ? (doc.lifecycleChangedAt ?? undefined)
            : undefined,
      };
    });
  }

  get docs() {
    return this._proxy.pages;
  }

  get yDocs() {
    return this._yMap.get('pages') as unknown as Y.Array<unknown>;
  }

  constructor(
    doc: Y.Doc,
    private readonly usesWorkspaceState = false
  ) {
    this._doc = doc;
    const map = doc.getMap(this._id) as Y.Map<MetaState[keyof MetaState]>;
    this._yMap = map;
    this._proxy = createYProxy(map);
    this.refreshDocMetas();
    this._yMap.observeDeep(this._handleDocCollectionMetaEvents);
  }

  private _handleCommonFieldsEvent() {
    this.commonFieldsUpdated.next();
  }

  private refreshDocMetas() {
    this._docMetas = this.projectDocMetas();
    this._docMetasById = new Map(this._docMetas.map(meta => [meta.id, meta]));
  }

  private _handleDocMetaEvent() {
    this.refreshDocMetas();
    const { docMetas, _prevDocs } = this;

    const newDocs = new Set<string>();

    docMetas.forEach(docMeta => {
      if (!_prevDocs.has(docMeta.id)) {
        this.docMetaAdded.next(docMeta.id);
      }
      newDocs.add(docMeta.id);
    });

    _prevDocs.forEach(prevDocId => {
      const isRemoved = newDocs.has(prevDocId) === false;
      if (isRemoved) {
        this.docMetaRemoved.next(prevDocId);
      }
    });

    this._prevDocs = newDocs;

    this.docMetaUpdated.next();
  }

  private _assertValidDocTitle(meta: Partial<DocMeta>) {
    if (meta.title !== undefined && typeof meta.title !== 'string') {
      throw new TypeError('Document title must be a string');
    }
  }

  addDocMeta(doc: DocMeta, index?: number) {
    this._assertValidDocTitle(doc);
    this._doc.transact(() => {
      if (!this.docs) {
        return;
      }
      const docs = this.docs as unknown[];
      if (index === undefined) {
        docs.push(doc);
      } else {
        docs.splice(index, 0, doc);
      }
    }, this._doc.clientID);
  }

  getDocMeta(id: string) {
    return this._docMetasById.get(id);
  }

  initialize() {
    if (
      !this._proxy.pages ||
      (this.usesWorkspaceState && !Array.isArray(this._proxy.pages))
    ) {
      this._doc.transact(() => {
        this._proxy.pages = [];
      }, this._doc.clientID);
    }
  }

  removeDocMeta(id: string) {
    // you cannot delete a doc if there's no doc
    if (!this.docs) {
      return;
    }

    const docs = this.docs;
    if (!Array.isArray(docs)) return;
    const index = docs.findIndex(
      doc => !!doc && typeof doc === 'object' && 'id' in doc && doc.id === id
    );
    if (index === -1) {
      return;
    }
    this._doc.transact(() => {
      if (!this.docs) {
        return;
      }
      this.docs.splice(index, 1);
    }, this._doc.clientID);
  }

  setDocMeta(id: string, props: Partial<DocMeta>) {
    this._assertValidDocTitle(props);
    if (this.usesWorkspaceState && !this.getDocMeta(id)) return;
    if (
      this.usesWorkspaceState &&
      (!Array.isArray(this.docs) ||
        !(this.docs as DocMeta[]).some(doc => doc?.id === id))
    ) {
      this.initialize();
      this.addDocMeta({ id, title: '', createDate: Date.now(), tags: [] });
    }
    const docs = (this.docs as DocMeta[]) ?? [];
    const index = docs.findIndex((doc: DocMeta) => id === doc.id);

    this._doc.transact(() => {
      if (!this.docs) {
        return;
      }
      if (index === -1) return;

      const doc = this.docs[index] as Record<string, unknown>;
      Object.entries(props).forEach(([key, value]) => {
        doc[key] = value;
      });
    }, this._doc.clientID);
  }
}
