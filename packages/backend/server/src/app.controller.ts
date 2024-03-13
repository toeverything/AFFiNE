import { Controller, Get } from '@nestjs/common';

import { Public } from './core/auth';
import { Config } from './fundamentals/config';

@Controller('/')
export class AppController {
  constructor(private readonly config: Config) {}

  @Public()
  @Get()
  info() {
    return {
      compatibility: this.config.version,
      message: `AFFiNE ${this.config.version} Server`,
      type: this.config.type,
      flavor: this.config.flavor,
    };
  }
}
