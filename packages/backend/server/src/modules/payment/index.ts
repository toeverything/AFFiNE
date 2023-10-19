import { Module } from '@nestjs/common';

import { SubscriptionResolver, UserSubscriptionResolver } from './resolver';
import { SubscriptionService } from './service';
import { StripeProvider } from './stripe';
import { StripeWebhook } from './webhook';

@Module({
  providers: [
    StripeProvider,
    SubscriptionService,
    SubscriptionResolver,
    UserSubscriptionResolver,
  ],
  controllers: [StripeWebhook],
})
export class PaymentModule {}
