import { Module } from '@nestjs/common';

import { QuotaModule } from '../quota';
import { SubscriptionResolver, UserSubscriptionResolver } from './resolver';
import { ScheduleManager } from './schedule';
import { SubscriptionService } from './service';
import { StripeProvider } from './stripe';
import { StripeWebhook } from './webhook';

@Module({
  imports: [QuotaModule],
  providers: [
    ScheduleManager,
    StripeProvider,
    SubscriptionService,
    SubscriptionResolver,
    UserSubscriptionResolver,
  ],
  controllers: [StripeWebhook],
})
export class PaymentModule {}
