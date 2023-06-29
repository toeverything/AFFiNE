import { Controller, Get } from '@nestjs/common';

import pkg from '../package.json' assert { type: 'json' };

@Controller('/')
export class AppController {
  @Get()
  hello() {
    return {
      message: `AFFiNE GraphQL server: ${pkg.version}`,
    };
  }
}
