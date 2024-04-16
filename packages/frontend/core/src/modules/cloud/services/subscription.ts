import { type CreateCheckoutSessionInput } from '@affine/graphql';
import { ApplicationStarted, OnEvent, Service } from '@toeverything/infra';

import { Subscription } from '../entities/subscription';
import { SubscriptionPrices } from '../entities/subscription-prices';
import { AccountChanged } from './auth';
import type { SubscriptionStoreService } from './subscription-store';

@OnEvent(AccountChanged, e => e.onAccountChanged)
@OnEvent(ApplicationStarted, e => e.onApplicationStarted)
export class SubscriptionService extends Service {
  subscription = this.framework.createEntity(Subscription);
  prices = this.framework.createEntity(SubscriptionPrices);

  constructor(private readonly store: SubscriptionStoreService) {
    super();
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput) {
    return await this.store.createCheckoutSession(input);
  }

  private onApplicationStarted() {
    this.subscription.revalidate();
  }

  private onAccountChanged() {
    this.subscription.revalidate();
  }
}
