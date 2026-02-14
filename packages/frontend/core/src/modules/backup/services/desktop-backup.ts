import {
  catchErrorInto,
  effect,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { switchMap, tap } from 'rxjs';

import { DesktopApiService } from '../../desktop-api';
import { WorkspacesService } from '../../workspace';
import { _addLocalWorkspace } from '../../workspace-engine';
import { BaseBackupService } from './base';

type BackupWorkspaceResult = Awaited<
  ReturnType<DesktopApiService['handler']['workspace']['getBackupWorkspaces']>
>;

export class DesktopBackupService extends BaseBackupService {
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
      return result.workspaceId;
    }
    throw new Error('Failed to recover backup');
  }

  async deleteBackupWorkspace(backupWorkspaceId: string) {
    await this.desktopApiService.handler.workspace.deleteBackupWorkspace(
      backupWorkspaceId
    );
    this.revalidate();
  }

  async downloadBackup(_workspaceId: string) {
    return;
  }

  async importBackup(_file: File): Promise<string> {
    return '';
  }

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
