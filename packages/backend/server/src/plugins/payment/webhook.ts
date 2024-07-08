import assert from 'node:assert';

import type { RawBodyRequest } from '@nestjs/common';
import { Controller, Logger, Post, Req } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request } from 'express';
import Stripe from 'stripe';

import { Public } from '../../core/auth';
import { Config, InternalServerError } from '../../fundamentals';

@Controller('/api/stripe')
export class StripeWebhook {
  private readonly webhookKey: string;
  private readonly logger = new Logger(StripeWebhook.name);

  constructor(
    config: Config,
    private readonly stripe: Stripe,
    private readonly event: EventEmitter2
  ) {
    assert(config.plugins.payment.stripe);
    this.webhookKey = config.plugins.payment.stripe.keys.webhookKey;
  }

  @Public()
  @Post('/webhook')
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    // Check if webhook signing is configured.

    // Retrieve the event by verifying the signature using the raw body and secret.
    const signature = req.headers['stripe-signature'];
    try {
      const event = this.stripe.webhooks.constructEvent(
        req.rawBody ?? '',
        signature ?? '',
        this.webhookKey
      );

      this.logger.debug(
        `[${event.id}] Stripe Webhook {${event.type}} received.`
      );

      // Stripe requires responseing webhook immediately and handle event asynchronously.
      setImmediate(() => {
        // handle duplicated events?
        // see https://stripe.com/docs/webhooks#handle-duplicate-events
        this.event
          .emitAsync(
            event.type,
            event.data.object,
            // here to let event listeners know what exactly the event is if a handler can handle multiple events
            event.type
          )
          .catch(e => {
            this.logger.error('Failed to handle Stripe Webhook event.', e);
          });
      });
    } catch (err: any) {
      throw new InternalServerError(err.message);
    }
  }
}
