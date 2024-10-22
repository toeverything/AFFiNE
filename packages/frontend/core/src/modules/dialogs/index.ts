import type { Framework } from '@toeverything/infra';
import { WorkspaceScope } from '@toeverything/infra';

import { GlobalDialogService } from './services/dialog';
import { WorkspaceDialogService } from './services/workspace-dialog';

export type { GLOBAL_DIALOG_SCHEMA } from './constant';
export { GlobalDialogService } from './services/dialog';
export { WorkspaceDialogService } from './services/workspace-dialog';
export type { DialogComponentProps } from './types';

export function configureDialogModule(framework: Framework) {
  framework
    .service(GlobalDialogService)
    .scope(WorkspaceScope)
    .service(WorkspaceDialogService);
}
