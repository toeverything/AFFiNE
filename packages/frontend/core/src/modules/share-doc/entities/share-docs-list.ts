import { DebugLogger } from '@affine/debug';
import type { GetWorkspacePublicPagesQuery } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  Entity,
  exhaustMapWithTrailing,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { map, tap } from 'rxjs';

import type { GlobalCache } from '../../storage';
import type { WorkspaceService } from '../../workspace';
import type { ShareDocsStore } from '../stores/share-docs';

type ShareDocListType = GetWorkspacePublicPagesQuery['workspace']['publicDocs'];

export const logger = new DebugLogger('affine:share-doc-list');

export class ShareDocsList extends Entity {
  list$ = LiveData.from(
    this.cache
      .watch<ShareDocListType>('share-docs')
      .pipe(map(list => list ?? [])),
    []
  );
  isLoading$ = new LiveData<boolean>(false);
  error$ = new LiveData<any>(null);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: ShareDocsStore,
    private readonly cache: GlobalCache
  ) {
    super();
  }

  revalidate = effect(
    exhaustMapWithTrailing(() =>
      fromPromise(signal => {
        return this.store.getWorkspacesShareDocs(
          this.workspaceService.workspace.id,
          signal
        );
      }).pipe(
        smartRetry(),
        tap(list => {
          this.cache.set('share-docs', list);
        }),
        catchErrorInto(this.error$, err =>
          logger.error('revalidate share docs error', err)
        ),
        onStart(() => {
          this.isLoading$.next(true);
        }),
        onComplete(() => {
          this.isLoading$.next(false);
        })
      )
    )
  );

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
