import type { PageMeta } from '@blocksuite/store';
import { Observable } from 'rxjs';

import { LiveData } from '../livedata';
import { SyncEngineStep, type Workspace } from '../workspace';

export class PageListService {
  constructor(private readonly workspace: Workspace) {}

  public readonly pages = LiveData.from<PageMeta[]>(
    new Observable(subscriber => {
      subscriber.next(
        Array.from(this.workspace.blockSuiteWorkspace.meta.pageMetas)
      );

      const dispose =
        this.workspace.blockSuiteWorkspace.meta.pageMetasUpdated.on(() => {
          subscriber.next(
            Array.from(this.workspace.blockSuiteWorkspace.meta.pageMetas)
          );
        }).dispose;
      return () => {
        dispose();
      };
    }),
    []
  );

  public readonly isReady = LiveData.from<boolean>(
    new Observable(subscriber => {
      subscriber.next(
        this.workspace.engine.status.sync.step === SyncEngineStep.Synced
      );

      const dispose = this.workspace.engine.onStatusChange.on(() => {
        subscriber.next(
          this.workspace.engine.status.sync.step === SyncEngineStep.Synced
        );
      }).dispose;
      return () => {
        dispose();
      };
    }),
    false
  );

  public getPageMetaById(id: string) {
    return this.pages.value.find(page => page.id === id);
  }
}
