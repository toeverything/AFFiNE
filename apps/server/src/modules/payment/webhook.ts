import {
  Controller,
  Logger,
  NotAcceptableException,
  Post,
  Req,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import Stripe from 'stripe';

import { Config } from '../../config';

@Controller('/stripe/webhook')
export class StripeWebhook {
  private readonly config: Config['payment'];
  private readonly logger = new Logger(StripeWebhook.name);

  constructor(
    config: Config,
    private readonly stripe: Stripe,
    private readonly event: EventEmitter2
  ) {
    this.config = config.payment;
  }

  @Post()
  async handleWebhook(@Req() req: Request) {
    // Check if webhook signing is configured.
    if (!this.config.stripe.keys.webhookKey) {
      this.logger.error(
        'Stripe Webhook key is not set, but a webhook was received.'
      );
      throw new NotAcceptableException();
    }

    // Retrieve the event by verifying the signature using the raw body and secret.
    const signature = req.headers['stripe-signature'];
    try {
      const event = this.stripe.webhooks.constructEvent(
        req.body,
        signature ?? '',
        this.config.stripe.keys.webhookKey
      );

      // handle duplicated events?
      // see https://stripe.com/docs/webhooks#handle-duplicate-events
      await this.event.emitAsync(event.type, event.data.object);
    } catch (err) {
      this.logger.error('Stripe Webhook error', err);
      throw new NotAcceptableException();
    }
  }
}
