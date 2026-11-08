import { Controller, Get, Header, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Throttle } from '../../base';
import { Public } from '../../core/auth';
import { CaptchaService } from './service';

@Throttle('strict')
@Controller('/api/auth')
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}

  @Public()
  @Get('/captcha')
  @Header('Cache-Control', 'no-store')
  async getChallenge(@Req() req: Request) {
    return this.captcha.getClientConfig(
      req.get('x-affine-client-kind') === 'native'
    );
  }
}
