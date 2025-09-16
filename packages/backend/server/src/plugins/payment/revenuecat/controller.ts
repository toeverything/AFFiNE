import type { RawBodyRequest } from '@nestjs/common';
import { Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Config, EventBus } from '../../../base';
import { Public } from '../../../core/auth';

@Controller('/api/revenuecat')
export class RevenueCatWebhookController {
  private readonly logger = new Logger(RevenueCatWebhookController.name);

  constructor(
    private readonly config: Config,
    private readonly event: EventBus
  ) {}

  @Public()
  @Post('/webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authorization?: string
  ) {
    const expected = this.config.payment.revenuecat?.webhookAuth || '';
    if (!expected || authorization !== expected) {
      this.logger.warn('RevenueCat webhook unauthorized.');
      return { ok: true };
    }

    try {
      const payload = req.body as any;
      const eventId = payload?.event?.id || 'unknown';
      const appUserId = payload?.event?.app_user_id || payload?.app_user_id;
      const eventType = payload?.event?.type || payload?.type;

      this.logger.log(
        `[${eventId}] RevenueCat Webhook {${eventType}} received for appUserId=${appUserId}.`
      );

      // immediately ack and process asynchronously
      this.event
        .emitAsync('revenuecat.webhook' as any, { appUserId, payload })
        .catch((e: unknown) => {
          this.logger.error(
            'Failed to handle RevenueCat Webhook event.',
            e as Error
          );
        });
    } catch (e) {
      this.logger.error('RevenueCat webhook error', e as Error);
    }

    return { ok: true };
  }
}
