import { Injectable, Logger } from '@nestjs/common';
import { OnEvent as RawOnEvent } from '@nestjs/event-emitter';
import { User } from '@prisma/client';
import Stripe from 'stripe';

import { Config, PaymentRecurringPlan } from '../../config';

const OnEvent = (
  event: Stripe.Event.Type,
  opts?: Parameters<typeof RawOnEvent>[1]
) => RawOnEvent(event, opts);

@Injectable()
export class PaymentService {
  private readonly paymentConfig: Config['payment'];
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly config: Config,
    private readonly stripe: Stripe
  ) {
    this.paymentConfig = config.payment;

    if (
      !this.paymentConfig.stripe.keys.APIKey ||
      !this.paymentConfig.stripe.keys.webhookKey /* default empty string */
    ) {
      this.logger.warn('Stripe API key not set, Stripe will be disabled');
      this.logger.warn('Set STRIPE_API_KEY to enable Stripe');
    }
  }

  async checkout(user: User, plan: PaymentRecurringPlan) {
    return await this.stripe.checkout.sessions.create({
      line_items: [
        {
          price: this.paymentConfig.stripe.prices[plan],
          quantity: 1,
        },
      ],
      subscription_data: {
        // TBD: Free trial?
        trial_period_days: plan === PaymentRecurringPlan.Monthly ? 7 : 14,
      },
      allow_promotion_codes: true,
      tax_id_collection: {
        enabled: true,
      },
      mode: 'subscription',
      success_url: this.config.baseUrl + '/payment/success',
      customer_email: user.email,
    });
  }

  @OnEvent('checkout.session.completed')
  async onPayed(session: Stripe.Checkout.Session) {
    this.logger.log(`Payed: ${session.id}`);
  }
}
