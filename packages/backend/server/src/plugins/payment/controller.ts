import type { RawBodyRequest } from '@nestjs/common';
import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { BadRequest, InternalServerError } from '../../base';
import { Public } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';

@Controller()
export class StripeWebhookController {
  constructor(private readonly runtime: BackendRuntimeProvider) {}

  @Public()
  @Post(['/api/stripe/webhook', '/api/worker/stripeWebhook'])
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['stripe-signature'];
    try {
      return await this.runtime.capturePaymentWebhookV1(
        'stripe',
        Buffer.from(req.rawBody ?? ''),
        typeof signature === 'string' ? signature : ''
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('invalid Stripe webhook signature')) {
        throw new BadRequest(message);
      }
      throw new InternalServerError(message);
    }
  }
}
