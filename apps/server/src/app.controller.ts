import { Controller, Get } from '@nestjs/common';

@Controller('/')
export class AppController {
  get message() {
    return {
      compatibility: AFFiNE.version,
      message: `AFFiNE ${AFFiNE.version} Server`,
    };
  }

  @Get()
  info() {
    return this.message;
  }
  @Get('/ping')
  ping() {
    return this.message;
  }
}
