import { type CreateCheckoutSessionInput } from '@affine/graphql';
import { tracker } from '@affine/track';
import { OnEvent, Service } from '@toeverything/infra';

import { Subscription } from '../entities/subscription';
import { SubscriptionPrices } from '../entities/subscription-prices';
import { AccountChanged } from '../events/account-changed';
import type { SubscriptionStore } from '../stores/subscription';

@OnEvent(AccountChanged, e => e.onAccountChanged)
export class SubscriptionService extends Service {
  subscription = this.framework.createEntity(Subscription);
  prices = this.framework.createEntity(SubscriptionPrices);

  constructor(private readonly store: SubscriptionStore) {
    super();
    this.subscription.ai$
      .map(sub => !!sub)
      .distinctUntilChanged()
      .subscribe(ai => {
        tracker.people.set({
          ai,
        });
      });
    this.subscription.pro$
      .map(sub => !!sub)
      .distinctUntilChanged()
      .subscribe(pro => {
        tracker.people.set({
          pro,
        });
      });
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput) {
    return await this.store.createCheckoutSession(input);
  }

  private onAccountChanged() {
    this.subscription.revalidate();
  }
}
