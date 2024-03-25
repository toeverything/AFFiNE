import { Controller, Get, UseGuards } from '@nestjs/common';

import { Public } from '../../core/auth';
import { AuthThrottlerGuard, Throttle } from '../../fundamentals';
import { CaptchaService } from './service';

@Controller('/api/auth')
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Throttle({
    default: {
      limit: 60,
      ttl: 60,
    },
  })
  @Get('/challenge')
  async getChallenge() {
    return this.captcha.getChallengeToken();
  }
}
