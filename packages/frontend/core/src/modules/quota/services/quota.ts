import { Service } from '@toeverything/infra';

import { WorkspaceQuota } from '../entities/quota';

export class WorkspaceQuotaService extends Service {
  quota = this.framework.createEntity(WorkspaceQuota);
}
