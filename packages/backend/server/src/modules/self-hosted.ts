import { Module } from '@nestjs/common';
import { ResolveField, Resolver } from '@nestjs/graphql';

import { UserSubscriptionType } from './payment/resolver';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from './payment/service';
import { UserType } from './users';

const YEAR = 1000 * 60 * 60 * 24 * 30 * 12;

@Resolver(() => UserType)
export class SelfHostedDummyResolver {
  private readonly start = new Date();
  private readonly end = new Date(Number(this.start) + YEAR);
  constructor() {}

  @ResolveField(() => UserSubscriptionType)
  async subscription() {
    return {
      stripeSubscriptionId: 'dummy',
      plan: SubscriptionPlan.SelfHosted,
      recurring: SubscriptionRecurring.Yearly,
      status: SubscriptionStatus.Active,
      start: this.start,
      end: this.end,
      createdAt: this.start,
      updatedAt: this.start,
    };
  }
}

@Module({
  providers: [SelfHostedDummyResolver],
})
export class SelfHostedModule {}
