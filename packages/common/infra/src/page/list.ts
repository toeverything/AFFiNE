import type { PageMeta } from '@blocksuite/store';
import { Observable } from 'rxjs';

import { LiveData } from '../livedata';
import type { Workspace } from '../workspace';

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
}
