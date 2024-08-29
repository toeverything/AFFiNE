import type { Framework } from '@toeverything/infra';

import { CreateWorkspaceDialog } from './entities/dialog';
import { CreateWorkspaceDialogService } from './services/dialog';

export { CreateWorkspaceDialogService } from './services/dialog';
export type { CreateWorkspaceCallbackPayload } from './types';
export { CreateWorkspaceDialogProvider } from './views/dialog';

export function configureCreateWorkspaceModule(framework: Framework) {
  framework.service(CreateWorkspaceDialogService).entity(CreateWorkspaceDialog);
}
