import { DebugLogger } from '@affine/debug';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import { catchError, from, mergeMap, NEVER, switchMap } from 'rxjs';

import { Entity } from '../../../framework';
import { effect, LiveData, onComplete, onStart } from '../../../livedata';
import type { WorkspaceMetadata } from '../metadata';
import type { WorkspaceFlavourProvider } from '../providers/flavour';
import type { WorkspaceListCacheStoreService } from '../services/list-cache-store';

const logger = new DebugLogger('affine:workspace-profile');

export class WorkspaceList extends Entity {
  workspaces$ = LiveData.from(this.cache.watchCachedWorkspaces(), []);
  isLoading$ = new LiveData(false);
  error$ = new LiveData<Error | null>(null);

  constructor(
    private readonly providers: WorkspaceFlavourProvider[],
    private readonly cache: WorkspaceListCacheStoreService
  ) {
    super();

    this.subscribe();
  }

  private setFlavourCache(
    flavour: WorkspaceFlavour,
    workspaces: WorkspaceMetadata[]
  ) {
    this.cache.setCachedWorkspaces(
      this.workspaces$.value
        .filter(w => w.flavour !== flavour)
        .concat(workspaces)
    );
  }

  private setCache(workspaces: WorkspaceMetadata[]) {
    this.cache.setCachedWorkspaces(workspaces);
  }

  private subscribe() {
    this.providers.forEach(provider => {
      provider.subscribeWorkspaces(workspaces => {
        this.setFlavourCache(provider.flavour, workspaces);
      });
    });
  }

  revalidate = effect(
    switchMap((_: boolean) =>
      from(Promise.all(this.providers.map(p => p.getWorkspaces()))).pipe(
        mergeMap(workspaces => {
          this.setCache(workspaces.flat());
          return NEVER;
        }),
        catchError(err => {
          this.error$.next(err);
          logger.error('revalidate workspace list error', err);
          return NEVER;
        }),
        onStart(() => this.isLoading$.next(true)),
        onComplete(() => this.isLoading$.next(false))
      )
    )
  );
}
