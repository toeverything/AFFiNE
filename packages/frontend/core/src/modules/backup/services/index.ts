import {
  catchErrorInto,
  effect,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  Service,
} from '@toeverything/infra';
import { switchMap, tap } from 'rxjs';

import type { DesktopApiService } from '../../desktop-api';
import type { WorkspacesService } from '../../workspace';
import { _addLocalWorkspace } from '../../workspace-engine';

type BackupWorkspaceResult = Awaited<
  ReturnType<DesktopApiService['handler']['workspace']['getBackupWorkspaces']>
>;

export class BackupService extends Service {
  constructor(
    private readonly desktopApiService: DesktopApiService,
    private readonly workspacesService: WorkspacesService
  ) {
    super();
  }

  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  pageBackupWorkspaces$ = new LiveData<BackupWorkspaceResult | undefined>(
    undefined
  );

  readonly revalidate = effect(
    switchMap(() =>
      fromPromise(async () => {
        return this.desktopApiService.handler.workspace.getBackupWorkspaces();
      }).pipe(
        tap(data => {
          this.pageBackupWorkspaces$.setValue(data);
        }),
        catchErrorInto(this.error$),
        onStart(() => this.isLoading$.setValue(true)),
        onComplete(() => this.isLoading$.setValue(false))
      )
    )
  );

  async recoverBackupWorkspace(dbPath: string) {
    const result =
      await this.desktopApiService.handler.dialog.loadDBFile(dbPath);
    if (result.workspaceId) {
      _addLocalWorkspace(result.workspaceId);
      this.workspacesService.list.revalidate();
    }
    return result.workspaceId;
  }

  async deleteBackupWorkspace(backupWorkspaceId: string) {
    await this.desktopApiService.handler.workspace.deleteBackupWorkspace(
      backupWorkspaceId
    );
    this.revalidate();
  }

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
