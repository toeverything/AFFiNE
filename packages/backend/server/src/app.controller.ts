import { Controller, Get } from '@nestjs/common';

import { Config } from './fundamentals/config';

@Controller('/')
export class AppController {
  constructor(private readonly config: Config) {}

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
