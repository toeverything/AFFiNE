import type { RawBodyRequest } from '@nestjs/common';
import { Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';

@Controller('/api/revenuecat')
export class RevenueCatWebhookController {
  constructor(private readonly runtime: BackendRuntimeProvider) {}

  @Public()
  @Post('/webhook')
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const authorization = req.headers.authorization;
    return this.runtime.capturePaymentWebhookV1(
      'revenuecat',
      Buffer.from(req.rawBody ?? ''),
      typeof authorization === 'string' ? authorization : ''
    );
  }
}
