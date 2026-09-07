import { timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, PrismaClient, Provider } from '@prisma/client';
import { z } from 'zod';

import { Config, EventBus, JobQueue } from '../../../base';
import { Public } from '../../../core/auth';
import { FeatureService } from '../../../core/features';
import { Models } from '../../../models';

const RcEventSchema = z
  .object({
    type: z.enum([
      'TEST',
      'INITIAL_PURCHASE',
      'NON_RENEWING_PURCHASE',
      'RENEWAL',
      'PRODUCT_CHANGE',
      'CANCELLATION',
      'BILLING_ISSUE',
      'SUBSCRIBER_ALIAS',
      'SUBSCRIPTION_PAUSED',
      'UNCANCELLATION',
      'TRANSFER',
      'SUBSCRIPTION_EXTENDED',
      'EXPIRATION',
      'TEMPORARY_ENTITLEMENT_GRANT',
      'INVOICE_ISSUANCE',
      'VIRTUAL_CURRENCY_TRANSACTION',
    ]),
    id: z.string(),
    app_id: z.string(),
    environment: z.enum(['PRODUCTION', 'SANDBOX']),

    app_user_id: z.string().optional(),
    store: z.string().optional(),
    is_family_share: z.boolean().nullable().optional(),
    period_type: z
      .enum(['TRIAL', 'INTRO', 'NORMAL', 'PROMOTIONAL', 'PREPAID'])
      .nullable()
      .optional(),
    original_transaction_id: z.string().nullable().optional(),
    transaction_id: z.string().nullable().optional(),
    purchase_token: z.string().nullable().optional(),
  })
  .passthrough();

const RcWebhookPayloadSchema = z.object({ event: RcEventSchema }).passthrough();

export type RcEvent = z.infer<typeof RcEventSchema>;
type RcPayload = z.infer<typeof RcWebhookPayloadSchema>;

@Controller('/api/revenuecat')
export class RevenueCatWebhookController {
  private readonly logger = new Logger(RevenueCatWebhookController.name);

  constructor(
    private readonly config: Config,
    private readonly event: EventBus,
    private readonly queue: JobQueue,
    private readonly db: PrismaClient,
    private readonly models: Models,
    private readonly feature: FeatureService
  ) {}

  private authorized(authorization: string | undefined, webhookAuth: string) {
    if (!authorization || !webhookAuth) {
      return false;
    }

    const actual = Buffer.from(authorization);
    const expected = Buffer.from(webhookAuth);

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private async markEventReceived(event: RcEvent, appUserId?: string) {
    const existing = await this.db.paymentEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider: Provider.revenuecat,
          externalEventId: event.id,
        },
      },
    });
    if (existing) {
      return false;
    }

    try {
      await this.db.paymentEvent.create({
        data: {
          provider: Provider.revenuecat,
          eventType: event.type,
          externalEventId: event.id,
          targetType: appUserId ? 'user' : undefined,
          targetId: appUserId,
          externalPaymentId: event.transaction_id || undefined,
          metadata: event as unknown as Prisma.InputJsonValue,
          processingStatus: 'processed',
          processedAt: new Date(),
        },
      });
      return true;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return false;
      }
      throw e;
    }
  }

  @Public()
  @Post('/webhook')
  async handleWebhook(
    @Body() body: RcPayload,
    @Headers('authorization') authorization?: string
  ) {
    const { enabled, webhookAuth, environment } =
      this.config.payment.revenuecat || {};
    if (!enabled) {
      return { ok: true };
    }

    if (!this.authorized(authorization, webhookAuth || '')) {
      this.logger.warn('RevenueCat webhook unauthorized.');
      throw new UnauthorizedException('RevenueCat webhook unauthorized.');
    }

    try {
      const parsed = RcWebhookPayloadSchema.safeParse(body);
      if (!parsed.success) {
        this.logger.warn(
          'RevenueCat webhook invalid payload received.',
          parsed.error
        );
        throw new BadRequestException('Invalid RevenueCat webhook payload.');
      }

      const event = parsed.data.event;
      const { id, app_user_id: appUserId, type } = event;

      if (event.environment.toLowerCase() !== environment?.toLowerCase()) {
        return { ok: true };
      }

      const logParams = {
        appUserId,
        familyShare: event.is_family_share,
        environment: event.environment,
        transactionId: event.transaction_id,
      };
      this.logger.log(
        `[${id}] RevenueCat Webhook {${type}} received for appUserId=${appUserId}.`
      );
      if (appUserId && !appUserId.startsWith('$RCAnonymousID:')) {
        const user = await this.models.user.get(appUserId);
        if (user) {
          if (
            (typeof event.is_family_share !== 'boolean' ||
              !event.is_family_share) &&
            (environment.toLowerCase() === 'production' ||
              this.feature.isStaff(user.email))
          ) {
            if (!(await this.markEventReceived(event, appUserId))) {
              return;
            }

            // immediately ack and process asynchronously
            this.event
              .emitAsync('revenuecat.webhook', { appUserId, event })
              .catch((e: Error) => {
                this.logger.error(
                  'Failed to handle RevenueCat Webhook event.',
                  e
                );
              });
            return;
          } else {
            this.logger.warn(
              `[${id}] RevenueCat Webhook received for non-acceptable params.`,
              logParams
            );
          }
        }
      } else if (event.transaction_id) {
        if (!(await this.markEventReceived(event))) {
          return;
        }

        await this.queue
          .add('nightly.revenuecat.subscription.refresh.anonymous', {
            externalRef: event.transaction_id,
            startTime: Date.now(),
          })
          .catch((e: Error) => {
            this.logger.error('Failed to handle RevenueCat Webhook event.', e);
          });
        return;
      }
      this.logger.warn(
        `RevenueCat Webhook received for unknown user`,
        logParams
      );
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      this.logger.error('RevenueCat webhook error', e as Error);
      throw e;
    }

    return { ok: true };
  }
}
