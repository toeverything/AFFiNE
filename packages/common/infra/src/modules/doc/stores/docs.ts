import type { DocMode } from '@blocksuite/affine/blocks';
import type { DocMeta } from '@blocksuite/affine/store';
import { isEqual } from 'lodash-es';
import { distinctUntilChanged, Observable } from 'rxjs';

import { Store } from '../../../framework';
import type { WorkspaceLocalState, WorkspaceService } from '../../workspace';

export class DocsStore extends Store {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly localState: WorkspaceLocalState
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
    return new Observable<string[]>(subscriber => {
      const emit = () => {
        subscriber.next(
          this.workspaceService.workspace.docCollection.meta.docMetas.map(
            v => v.id
          )
        );
      };

      emit();

      const dispose =
        this.workspaceService.workspace.docCollection.meta.docMetaUpdated.on(
          emit
        ).dispose;
      return () => {
        dispose();
      };
    });
  }

  watchTrashDocIds() {
    return new Observable<string[]>(subscriber => {
      const emit = () => {
        subscriber.next(
          this.workspaceService.workspace.docCollection.meta.docMetas
            .map(v => (v.trash ? v.id : null))
            .filter(Boolean) as string[]
        );
      };

      emit();

      const dispose =
        this.workspaceService.workspace.docCollection.meta.docMetaUpdated.on(
          emit
        ).dispose;
      return () => {
        dispose();
      };
    });
  }

  watchDocMeta(id: string) {
    let meta: DocMeta | null = null;
    return new Observable<Partial<DocMeta>>(subscriber => {
      const emit = () => {
        if (meta === null) {
          // getDocMeta is heavy, so we cache the doc meta reference
          meta =
            this.workspaceService.workspace.docCollection.meta.getDocMeta(id) ||
            null;
        }
        subscriber.next({ ...meta });
      };

      emit();

      const dispose =
        this.workspaceService.workspace.docCollection.meta.docMetaUpdated.on(
          emit
        ).dispose;
      return () => {
        dispose();
      };
    }).pipe(distinctUntilChanged((p, c) => isEqual(p, c)));
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
    return this.localState.set(`page:${id}:mode`, mode);
  }

  getDocPrimaryModeSetting(id: string) {
    return this.localState.get<DocMode>(`page:${id}:mode`);
  }

  watchDocPrimaryModeSetting(id: string) {
    return this.localState.watch<DocMode>(`page:${id}:mode`);
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
