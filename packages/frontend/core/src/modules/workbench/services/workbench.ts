import { Service } from '@toeverything/infra';

import { Workbench } from '../entities/workbench';

export class WorkbenchService extends Service {
  workbench = this.framework.createEntity(Workbench);
}
