import { OnEvent, Service } from '@toeverything/infra';

import { UserCopilotQuota } from '../entities/user-copilot-quota';
import { AccountChanged } from './auth';

@OnEvent(AccountChanged, e => e.onAccountChanged)
export class UserCopilotQuotaService extends Service {
  copilotQuota = this.framework.createEntity(UserCopilotQuota);

  private onAccountChanged() {
    this.copilotQuota.revalidate();
  }
}
