import { mixpanel } from '@affine/core/utils';
import { ApplicationStarted, OnEvent, Service } from '@toeverything/infra';

import {
  AccountChanged,
  type AuthAccountInfo,
  type AuthService,
} from '../../cloud';

@OnEvent(ApplicationStarted, e => e.onApplicationStart)
@OnEvent(AccountChanged, e => e.onAccountChanged)
export class TelemetryService extends Service {
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
    if (account) {
      mixpanel.identify(account.id);
    }
  }

  onAccountChanged(account: AuthAccountInfo | null) {
    if (account === null) {
      mixpanel.reset();
    } else {
      mixpanel.reset();
      mixpanel.identify(account.id);
    }
  }
}
