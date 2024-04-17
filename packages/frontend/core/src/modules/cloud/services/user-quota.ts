import { OnEvent, Service } from '@toeverything/infra';

import { UserQuota } from '../entities/user-quota';
import { AccountChanged } from './auth';

@OnEvent(AccountChanged, e => e.onAccountChanged)
export class UserQuotaService extends Service {
  quota = this.framework.createEntity(UserQuota);

  private onAccountChanged() {
    this.quota.revalidate();
  }
}
