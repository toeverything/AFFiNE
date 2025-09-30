import type { RawBodyRequest } from '@nestjs/common';
import { Controller, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Config, EventBus, InternalServerError } from '../../base';
import { Public } from '../../core/auth';
import { StripeFactory } from './stripe';

@Controller('/api/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly config: Config,
    private readonly stripeProvider: StripeFactory,
    private readonly event: EventBus
  ) {}

  @Public()
  @Post('/webhook')
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const nestedWebhookKey = this.config.payment.stripe?.webhookKey;
    const legacyWebhookKey = this.config.payment.webhookKey;
    const webhookKey = nestedWebhookKey || legacyWebhookKey || '';
    // Retrieve the event by verifying the signature using the raw body and secret.
    const signature = req.headers['stripe-signature'];
    try {
      const event = this.stripeProvider.stripe.webhooks.constructEvent(
        req.rawBody ?? '',
        signature ?? '',
        webhookKey
      );

      this.logger.debug(
        `[${event.id}] Stripe Webhook {${event.type}} received.`
      );

      // Stripe requires responseing webhook immediately and handle event asynchronously.
      setImmediate(() => {
        this.event.emitAsync(`stripe.${event.type}` as any, event).catch(e => {
          this.logger.error('Failed to handle Stripe Webhook event.', e);
        });
      });
    } catch (err: any) {
      throw new InternalServerError(err.message);
    }
  }
}
