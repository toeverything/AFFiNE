import { tracker } from '@affine/track';
import { OnEvent, Service } from '@toeverything/infra';

import { UserQuota } from '../entities/user-quota';
import { AccountChanged } from '../events/account-changed';

@OnEvent(AccountChanged, e => e.onAccountChanged)
export class UserQuotaService extends Service {
  constructor() {
    super();

    this.quota.quota$
      .map(q => q?.humanReadable.name)
      .distinctUntilChanged()
      .subscribe(quota => {
        tracker.people.set({
          quota,
        });
      });
  }

  quota = this.framework.createEntity(UserQuota);

  private onAccountChanged() {
    this.quota.revalidate();
  }
}
