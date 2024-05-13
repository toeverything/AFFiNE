import { mixpanel } from '@affine/core/utils';
import type { QuotaQuery } from '@affine/graphql';
import { ApplicationStarted, OnEvent, Service } from '@toeverything/infra';

import {
  AccountChanged,
  type AuthAccountInfo,
  type AuthService,
} from '../../cloud';
import { AccountLoggedOut } from '../../cloud/services/auth';
import { UserQuotaChanged } from '../../cloud/services/user-quota';

@OnEvent(ApplicationStarted, e => e.onApplicationStart)
@OnEvent(AccountChanged, e => e.updateIdentity)
@OnEvent(AccountLoggedOut, e => e.onAccountLoggedOut)
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
      mixpanel.register({
        appVersion: runtimeConfig.appVersion,
        environment: runtimeConfig.appBuildType,
        editorVersion: runtimeConfig.editorVersion,
        isSelfHosted: Boolean(runtimeConfig.isSelfHosted),
        isDesktop: environment.isDesktop,
      });
    }
    const account = this.auth.session.account$.value;
    this.updateIdentity(account);
  }

  updateIdentity(account: AuthAccountInfo | null) {
    if (!account) {
      return;
    }
    mixpanel.identify(account.id);
    mixpanel.people.set({
      $email: account.email,
      $name: account.label,
      $avatar: account.avatar,
    });
  }

  onAccountLoggedOut() {
    mixpanel.reset();
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
