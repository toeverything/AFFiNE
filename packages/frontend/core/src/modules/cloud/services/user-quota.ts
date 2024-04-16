import { Service } from '@toeverything/infra';

import { UserQuota } from '../entities/user-quota';

export class UserQuotaService extends Service {
  quota = this.framework.createEntity(UserQuota);
}
