import { Controller, Get } from '@nestjs/common';

import { SkipThrottle } from './base';
import { Public } from './core/auth';

@Controller('/info')
export class AppController {
  @SkipThrottle()
  @Public()
  @Get()
  info() {
    return {
      compatibility: env.version,
      message: `AFFiNE ${env.version} Server`,
      type: env.DEPLOYMENT_TYPE,
      flavor: env.FLAVOR,
    };
  }
}
