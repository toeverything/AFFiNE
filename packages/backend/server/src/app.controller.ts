import { Controller, Get } from '@nestjs/common';

import { Public } from './core/auth';
import { Config, SkipThrottle } from './fundamentals';

@Controller('/info')
export class AppController {
  constructor(private readonly config: Config) {}

  @SkipThrottle()
  @Public()
  @Get()
  info() {
    return {
      compatibility: this.config.version,
      message: `AFFiNE ${this.config.version} Server`,
      type: this.config.type,
      flavor: this.config.flavor.type,
    };
  }
}
