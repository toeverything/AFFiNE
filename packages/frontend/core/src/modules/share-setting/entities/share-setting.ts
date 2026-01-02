import { DebugLogger } from '@affine/debug';
import type { GetWorkspaceConfigQuery, InviteLink } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { exhaustMap, tap } from 'rxjs';

import type { WorkspaceService } from '../../workspace';
import type { WorkspaceShareSettingStore } from '../stores/share-setting';

type EnableAi = GetWorkspaceConfigQuery['workspace']['enableAi'];
type EnableSharing = GetWorkspaceConfigQuery['workspace']['enableSharing'];
type EnableUrlPreview =
  GetWorkspaceConfigQuery['workspace']['enableUrlPreview'];

const logger = new DebugLogger('affine:workspace-permission');

export class WorkspaceShareSetting extends Entity {
  enableAi$ = new LiveData<EnableAi | null>(null);
  enableSharing$ = new LiveData<EnableSharing | null>(null);
  enableUrlPreview$ = new LiveData<EnableUrlPreview | null>(null);
  inviteLink$ = new LiveData<InviteLink | null>(null);
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
        this.store.fetchWorkspaceConfig(
          this.workspaceService.workspace.id,
          signal
        )
      ).pipe(
        smartRetry(),
        tap(value => {
          if (value) {
            this.enableAi$.next(value.enableAi);
            this.enableSharing$.next(value.enableSharing);
            this.enableUrlPreview$.next(value.enableUrlPreview);
            this.inviteLink$.next(value.inviteLink);
          }
        }),
        catchErrorInto(this.error$, error => {
          logger.error('Failed to fetch workspace share settings', error);
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

  async setEnableSharing(enableSharing: EnableSharing) {
    await this.store.updateWorkspaceEnableSharing(
      this.workspaceService.workspace.id,
      enableSharing
    );
    await this.waitForRevalidation();
  }

  async setEnableAi(enableAi: EnableAi) {
    await this.store.updateWorkspaceEnableAi(
      this.workspaceService.workspace.id,
      enableAi
    );
    await this.waitForRevalidation();
  }

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
