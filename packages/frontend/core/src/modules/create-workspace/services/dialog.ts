import { Service } from '@toeverything/infra';

import { CreateWorkspaceDialog } from '../entities/dialog';

export class CreateWorkspaceDialogService extends Service {
  dialog = this.framework.createEntity(CreateWorkspaceDialog);
}
