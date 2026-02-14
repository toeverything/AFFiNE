import { createIdentifier, LiveData, Service } from '@toeverything/infra';

import type { DesktopApiService } from '../../desktop-api';

type BackupWorkspaceResult = Awaited<
  ReturnType<DesktopApiService['handler']['workspace']['getBackupWorkspaces']>
>;

export abstract class BaseBackupService extends Service {
  abstract isLoading$: LiveData<boolean>;
  abstract error$: LiveData<any>;
  abstract pageBackupWorkspaces$: LiveData<BackupWorkspaceResult | undefined>;
  abstract revalidate(): void;

  abstract recoverBackupWorkspace(dbPath: string): Promise<string>;
  abstract deleteBackupWorkspace(backupWorkspaceId: string): Promise<void>;

  abstract downloadBackup(workspaceId: string): Promise<void>;
  abstract importBackup(file: File): Promise<string>;
}

export const BackupService =
  createIdentifier<BaseBackupService>('BackupService');
