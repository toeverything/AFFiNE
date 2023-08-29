import { Controller, Get } from '@nestjs/common';

@Controller('/')
export class AppController {
  @Get()
  info() {
    const version = AFFiNE.version;
    return {
      compatibility: version,
      message: `AFFiNE ${version} Server`,
    };
  }
}
