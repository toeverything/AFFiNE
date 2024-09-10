import { DebugLogger } from '@affine/debug';
import type { GetEnableUrlPreviewQuery } from '@affine/graphql';
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
import type { WorkspaceShareSettingStore } from '../stores/share-setting';

type EnableUrlPreview =
  GetEnableUrlPreviewQuery['workspace']['enableUrlPreview'];

const logger = new DebugLogger('affine:workspace-permission');

export class WorkspaceShareSetting extends Entity {
  enableUrlPreview$ = new LiveData<EnableUrlPreview | null>(null);
  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly store: WorkspaceShareSettingStore
  ) {
    super();
    this.revalidate();
  }

  revalidate = effect(
    exhaustMap(() => {
      return fromPromise(signal =>
        this.store.fetchWorkspaceEnableUrlPreview(
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
        mapInto(this.enableUrlPreview$),
        catchErrorInto(this.error$, error => {
          logger.error('Failed to fetch enableUrlPreview', error);
        }),
        onStart(() => this.isLoading$.setValue(true)),
        onComplete(() => this.isLoading$.setValue(false))
      );
    })
  );

  async waitForRevalidation(signal?: AbortSignal) {
    this.revalidate();
    await this.isLoading$.waitFor(isLoading => !isLoading, signal);
  }

  async setEnableUrlPreview(enableUrlPreview: EnableUrlPreview) {
    await this.store.updateWorkspaceEnableUrlPreview(
      this.workspaceService.workspace.id,
      enableUrlPreview
    );
    await this.waitForRevalidation();
  }

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
