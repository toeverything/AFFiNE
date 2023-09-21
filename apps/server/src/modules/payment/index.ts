import { Module } from '@nestjs/common';

import { PaymentService } from './service';
import { StripeProvider } from './stripe';
import { StripeWebhook } from './webhook';

@Module({
  providers: [StripeProvider, PaymentService],
  controllers: [StripeWebhook],
})
export class PaymentModule {}
