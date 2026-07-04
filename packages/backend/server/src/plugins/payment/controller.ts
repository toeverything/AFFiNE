import type { RawBodyRequest } from '@nestjs/common';
import { Controller, Logger, Post, Req } from '@nestjs/common';
import { Prisma, PrismaClient, Provider } from '@prisma/client';
import type { Request } from 'express';
import Stripe from 'stripe';

import { Config, EventBus, InternalServerError } from '../../base';
import { Public } from '../../core/auth';
import { StripeFactory } from './stripe';

@Controller('/api/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly config: Config,
    private readonly db: PrismaClient,
    private readonly stripeProvider: StripeFactory,
    private readonly event: EventBus
  ) {}

  @Public()
  @Post('/webhook')
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const webhookKey = this.config.payment.stripe?.webhookKey || '';
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

      const existingPaymentEvent = await this.db.paymentEvent.findUnique({
        where: {
          provider_externalEventId: {
            provider: Provider.stripe,
            externalEventId: event.id,
          },
        },
      });
      if (existingPaymentEvent?.processingStatus === 'processed') {
        return;
      }

      const paymentEvent = existingPaymentEvent
        ? await this.db.paymentEvent.update({
            where: { id: existingPaymentEvent.id },
            data: {
              eventType: event.type,
              lastError: null,
              metadata: event as unknown as Prisma.InputJsonValue,
            },
          })
        : await this.db.paymentEvent.create({
            data: {
              provider: Provider.stripe,
              eventType: event.type,
              externalEventId: event.id,
              occurredAt: new Date(event.created * 1000),
              metadata: event as unknown as Prisma.InputJsonValue,
            },
          });

      if (paymentEvent.processingStatus === 'processing') {
        return;
      }

      // Stripe requires responding to webhooks immediately and handling events asynchronously.
      setImmediate(() => {
        this.processEvent(paymentEvent.id, event).catch(e => {
          this.logger.error('Failed to persist Stripe Webhook failure.', e);
        });
      });
    } catch (err: unknown) {
      throw new InternalServerError(
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  async processEvent(id: string, event: Stripe.Event) {
    const stuckBefore = new Date(Date.now() - 60 * 60 * 1000);
    const locked = await this.db.paymentEvent.updateMany({
      where: {
        id,
        OR: [
          { processingStatus: { in: ['pending', 'failed'] } },
          {
            processingStatus: 'processing',
            updatedAt: { lt: stuckBefore },
          },
        ],
      },
      data: {
        processingStatus: 'processing',
        processingAttempts: { increment: 1 },
      },
    });
    if (locked.count === 0) {
      return;
    }

    try {
      await this.event.emitAsync(
        `stripe.${event.type}` as keyof Events,
        event as never
      );
      await this.db.paymentEvent.update({
        where: { id },
        data: {
          processingStatus: 'processed',
          processedAt: new Date(),
          lastError: null,
        },
      });
    } catch (e) {
      await this.db.paymentEvent.update({
        where: { id },
        data: {
          processingStatus: 'failed',
          lastError: e instanceof Error ? e.message : String(e),
        },
      });
      this.logger.error('Failed to handle Stripe Webhook event.', e);
    }
  }
}
