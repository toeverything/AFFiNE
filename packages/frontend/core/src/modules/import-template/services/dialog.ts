import { Service } from '@toeverything/infra';

import { ImportTemplateDialog } from '../entities/dialog';

export class ImportTemplateDialogService extends Service {
  dialog = this.framework.createEntity(ImportTemplateDialog);
}
