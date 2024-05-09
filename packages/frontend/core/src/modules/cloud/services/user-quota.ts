import type { QuotaQuery } from '@affine/graphql';
import { createEvent, OnEvent, Service } from '@toeverything/infra';

import { UserQuota } from '../entities/user-quota';
import { AccountChanged } from './auth';

type UserQuotaInfo = NonNullable<QuotaQuery['currentUser']>['quota'];

export const UserQuotaChanged = createEvent<UserQuotaInfo>('UserQuotaChanged');

@OnEvent(AccountChanged, e => e.onAccountChanged)
export class UserQuotaService extends Service {
  constructor() {
    super();

    this.quota.quota$.distinctUntilChanged().subscribe(q => {
      this.eventBus.emit(UserQuotaChanged, q);
    });
  }

  quota = this.framework.createEntity(UserQuota);

  private onAccountChanged() {
    this.quota.revalidate();
  }
}
