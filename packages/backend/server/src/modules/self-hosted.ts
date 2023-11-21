import { Module } from '@nestjs/common';
import { ResolveField, Resolver } from '@nestjs/graphql';

import { UserSubscriptionType } from './payment/resolver';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from './payment/service';
import { UserType } from './users';

@Resolver(() => UserType)
export class SelfHostedDummyResolver {
  constructor() {}

  @ResolveField(() => UserSubscriptionType, { nullable: true })
  async subscription() {
    return {
      stripeSubscriptionId: 'dummy',
      plan: SubscriptionPlan.SelfHosted,
      recurring: SubscriptionRecurring.Monthly,
      status: SubscriptionStatus.Active,
      start: new Date(),
      end: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

@Module({
  providers: [SelfHostedDummyResolver],
})
export class SelfHostedModule {}
