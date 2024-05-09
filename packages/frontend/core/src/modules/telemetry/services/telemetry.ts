import { mixpanel } from '@affine/core/utils';
import type { QuotaQuery } from '@affine/graphql';
import { ApplicationStarted, OnEvent, Service } from '@toeverything/infra';

import {
  AccountChanged,
  type AuthAccountInfo,
  type AuthService,
} from '../../cloud';
import { UserQuotaChanged } from '../../cloud/services/user-quota';

@OnEvent(ApplicationStarted, e => e.onApplicationStart)
@OnEvent(AccountChanged, e => e.onAccountChanged)
@OnEvent(UserQuotaChanged, e => e.onUserQuotaChanged)
export class TelemetryService extends Service {
  private prevQuota: NonNullable<QuotaQuery['currentUser']>['quota'] | null =
    null;

  constructor(private readonly auth: AuthService) {
    super();
  }

  onApplicationStart() {
    if (process.env.MIXPANEL_TOKEN) {
      mixpanel.init(process.env.MIXPANEL_TOKEN || '', {
        track_pageview: true,
        persistence: 'localStorage',
      });
    }
    const account = this.auth.session.account$.value;
    this.onAccountChanged(account);
  }

  onAccountChanged(account: AuthAccountInfo | null) {
    if (account === null) {
      mixpanel.reset();
    } else {
      mixpanel.reset();
      mixpanel.identify(account.id);
      mixpanel.people.set({
        $email: account.email,
        $name: account.label,
        $avatar: account.avatar,
      });
    }
  }

  onUserQuotaChanged(quota: NonNullable<QuotaQuery['currentUser']>['quota']) {
    const plan = quota?.humanReadable.name;
    // only set when plan is not empty and changed
    if (plan !== this.prevQuota?.humanReadable.name && plan) {
      mixpanel.people.set({
        plan: quota?.humanReadable.name,
      });
    }
    this.prevQuota = quota;
  }
}
