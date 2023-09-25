import { Module } from '@nestjs/common';

import { SubscriptionResolver, UserSubscriptionResolver } from './resolver';
import { PaymentService } from './service';
import { StripeProvider } from './stripe';
import { StripeWebhook } from './webhook';

@Module({
  providers: [
    StripeProvider,
    PaymentService,
    SubscriptionResolver,
    UserSubscriptionResolver,
  ],
  controllers: [StripeWebhook],
})
export class PaymentModule {}
