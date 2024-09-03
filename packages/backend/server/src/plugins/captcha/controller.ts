import { Controller, Get } from '@nestjs/common';

import { Public } from '../../core/auth';
import { Throttle } from '../../fundamentals';
import { CaptchaService } from './service';

@Throttle('strict')
@Controller('/api/auth')
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}

  @Public()
  @Get('/challenge')
  async getChallenge() {
    return this.captcha.getChallengeToken();
  }
}
