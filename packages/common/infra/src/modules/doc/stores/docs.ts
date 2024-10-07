import type { DocMode } from '@blocksuite/affine/blocks';
import type { DocMeta } from '@blocksuite/affine/store';
import { distinctUntilChanged, map, switchMap } from 'rxjs';
import { Array as YArray, Map as YMap } from 'yjs';

import { Store } from '../../../framework';
import { yjsObserve, yjsObserveByPath, yjsObserveDeep } from '../../../utils';
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
    return this.workspaceService.workspace.docCollection.getDoc(id);
  }

  createBlockSuiteDoc() {
    return this.workspaceService.workspace.docCollection.createDoc();
  }

  watchDocIds() {
    return yjsObserveByPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(yjsObserve),
      map(meta => {
        if (meta instanceof YArray) {
          return meta.map(v => v.get('id'));
        } else {
          return [];
        }
      })
    );
  }

  watchTrashDocIds() {
    return yjsObserveByPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(yjsObserveDeep),
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
    return yjsObserveByPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(yjsObserve),
      map(meta => {
        if (meta instanceof YArray) {
          let docMetaYMap = null as YMap<any> | null;
          meta.forEach(doc => {
            if (doc.get('id') === id) {
              docMetaYMap = doc;
            }
          });
          return docMetaYMap;
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
    return this.workspaceService.workspace.engine.rootDocState$
      .map(state => !state.syncing)
      .asObservable();
  }

  setDocMeta(id: string, meta: Partial<DocMeta>) {
    this.workspaceService.workspace.docCollection.setDocMeta(id, meta);
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
    return this.workspaceService.workspace.engine.doc.waitForReady(id);
  }

  setPriorityLoad(id: string, priority: number) {
    return this.workspaceService.workspace.engine.doc.setPriority(id, priority);
  }

  markDocSyncStateAsReady(id: string) {
    this.workspaceService.workspace.engine.doc.markAsReady(id);
  }
}
