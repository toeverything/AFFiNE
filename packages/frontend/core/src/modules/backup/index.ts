import { type Framework } from '@toeverything/infra';

import { DesktopApiService } from '../desktop-api';
import { WorkspacesService } from '../workspace';
import {
  BackupService,
  DesktopBackupService,
  WebBackupService,
} from './services';

export { BackupService } from './services';

export function configureBackupModule(framework: Framework) {
  if (BUILD_CONFIG.isElectron) {
    framework.impl(BackupService, DesktopBackupService, [
      DesktopApiService,
      WorkspacesService,
    ]);
  } else {
    framework.impl(BackupService, WebBackupService, [WorkspacesService]);
  }
}
