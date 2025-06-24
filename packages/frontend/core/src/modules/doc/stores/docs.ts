import type { DocMode } from '@blocksuite/affine/model';
import type { DocMeta } from '@blocksuite/affine/store';
import {
  Store,
  yjsGetPath,
  yjsObserve,
  yjsObserveDeep,
  yjsObservePath,
} from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { distinctUntilChanged, map, switchMap } from 'rxjs';
import { Array as YArray, Map as YMap, transact } from 'yjs';

import type { WorkspaceService } from '../../workspace';
import type { DocPropertiesStore } from './doc-properties';

export class DocsStore extends Store {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly docPropertiesStore: DocPropertiesStore
  ) {
    super();
  }

  getBlockSuiteDoc(id: string) {
    return (
      this.workspaceService.workspace.docCollection
        .getDoc(id)
        ?.getStore({ id }) ?? null
    );
  }

  getBlocksuiteCollection() {
    return this.workspaceService.workspace.docCollection;
  }

  createDoc(docId?: string) {
    const id = docId ?? nanoid();

    transact(
      this.workspaceService.workspace.rootYDoc,
      () => {
        const docs = this.workspaceService.workspace.rootYDoc
          .getMap('meta')
          .get('pages');

        if (!docs || !(docs instanceof YArray)) {
          return;
        }

        docs.push([
          new YMap([
            ['id', id],
            ['title', ''],
            ['createDate', Date.now()],
            ['tags', new YArray()],
          ]),
        ]);
      },
      { force: true }
    );

    return id;
  }

  watchDocIds() {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(yjsObserve),
      map(meta => {
        if (meta instanceof YArray) {
          return meta.map(v => v.get('id') as string);
        } else {
          return [];
        }
      })
    );
  }

  watchAllDocUpdatedDate() {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(pages => yjsObservePath(pages, '*.updatedDate')),
      map(pages => {
        if (pages instanceof YArray) {
          return pages.map(v => ({
            id: v.get('id') as string,
            updatedDate: v.get('updatedDate') as number | undefined,
          }));
        } else {
          return [];
        }
      })
    );
  }

  watchAllDocTagIds() {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(pages => yjsObservePath(pages, '*.tags')),
      map(pages => {
        if (pages instanceof YArray) {
          return pages.map(v => ({
            id: v.get('id') as string,
            tags: (() => {
              const tags = v.get('tags');
              if (tags instanceof YArray) {
                return tags.toJSON() as string[];
              }
              return (tags ?? []) as string[];
            })(),
          }));
        } else {
          return [];
        }
      })
    );
  }

  watchAllDocCreateDate() {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(pages => yjsObservePath(pages, '*.createDate')),
      map(pages => {
        if (pages instanceof YArray) {
          return pages.map(v => ({
            id: v.get('id') as string,
            createDate: (v.get('createDate') ?? 0) as number,
          }));
        } else {
          return [];
        }
      })
    );
  }

  watchAllDocTitle() {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(pages => yjsObservePath(pages, '*.title')),
      map(pages => {
        if (pages instanceof YArray) {
          return pages.map(v => ({
            id: v.get('id') as string,
            title: (v.get('title') ?? '') as string,
          }));
        } else {
          return [];
        }
      })
    );
  }

  watchNonTrashDocIds() {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(pages => yjsObservePath(pages, '*.trash')),
      map(meta => {
        if (meta instanceof YArray) {
          return meta
            .map(v => (v.get('trash') ? null : v.get('id')))
            .filter(Boolean) as string[];
        } else {
          return [];
        }
      })
    );
  }

  watchTrashDocIds() {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(pages => yjsObservePath(pages, '*.trash')),
      map(meta => {
        if (meta instanceof YArray) {
          return meta
            .map(v => (v.get('trash') ? v.get('id') : null))
            .filter(Boolean) as string[];
        } else {
          return [];
        }
      })
    );
  }

  watchDocMeta(id: string) {
    let docMetaIndexCache = -1;
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(yjsObserve),
      map(meta => {
        if (meta instanceof YArray) {
          if (docMetaIndexCache >= 0) {
            const doc = meta.get(docMetaIndexCache);
            if (doc && doc.get('id') === id) {
              return doc as YMap<any>;
            }
          }

          // meta is YArray, `for-of` is faster then `for`
          let i = 0;
          for (const doc of meta) {
            if (doc && doc.get('id') === id) {
              docMetaIndexCache = i;
              return doc as YMap<any>;
            }
            i++;
          }
          return null;
        } else {
          return null;
        }
      }),
      switchMap(yjsObserveDeep),
      map(meta => {
        if (meta instanceof YMap) {
          return meta.toJSON() as Partial<DocMeta>;
        } else {
          return {};
        }
      })
    );
  }

  watchDocListReady() {
    return this.workspaceService.workspace.engine.doc
      .docState$(this.workspaceService.workspace.id)
      .pipe(map(state => state.synced));
  }

  setDocMeta(id: string, meta: Partial<DocMeta>) {
    this.workspaceService.workspace.docCollection.meta.setDocMeta(id, meta);
  }

  setDocPrimaryModeSetting(id: string, mode: DocMode) {
    return this.docPropertiesStore.updateDocProperties(id, {
      primaryMode: mode,
    });
  }

  getDocPrimaryModeSetting(id: string) {
    return this.docPropertiesStore.getDocProperties(id)?.primaryMode;
  }

  watchDocPrimaryModeSetting(id: string) {
    return this.docPropertiesStore.watchDocProperties(id).pipe(
      map(config => config?.primaryMode),
      distinctUntilChanged((p, c) => p === c)
    );
  }

  waitForDocLoadReady(id: string) {
    return this.workspaceService.workspace.engine.doc.waitForDocLoaded(id);
  }

  addPriorityLoad(id: string, priority: number) {
    return this.workspaceService.workspace.engine.doc.addPriority(id, priority);
  }
}
