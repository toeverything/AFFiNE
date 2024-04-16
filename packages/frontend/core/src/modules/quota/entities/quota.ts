import { DebugLogger } from '@affine/debug';
import type { WorkspaceQuotaQuery } from '@affine/graphql';
import type { WorkspaceService } from '@toeverything/infra';
import {
  backoffRetry,
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  mapInto,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { exhaustMap } from 'rxjs';

import { isBackendError, isNetworkError } from '../../cloud';
import type { WorkspaceQuotaStoreService } from '../services/quota-store';

type QuotaType = WorkspaceQuotaQuery['workspace']['quota'];

const logger = new DebugLogger('affine:workspace-permission');

export class WorkspaceQuota extends Entity {
  quota$ = new LiveData<QuotaType | null>(null);
  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: WorkspaceQuotaStoreService
  ) {
    super();
  }

  revalidate = effect(
    exhaustMap(() => {
      return fromPromise(signal =>
        this.store.fetchWorkspaceQuota(
          this.workspaceService.workspace.id,
          signal
        )
      ).pipe(
        backoffRetry({
          when: isNetworkError,
          count: Infinity,
        }),
        backoffRetry({
          when: isBackendError,
          count: 3,
        }),
        mapInto(this.quota$),
        catchErrorInto(this.error$, error => {
          logger.error('Failed to fetch isOwner', error);
        }),
        onStart(() => this.isLoading$.setValue(true)),
        onComplete(() => this.isLoading$.setValue(false))
      );
    })
  );
}
