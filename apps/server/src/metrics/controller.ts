import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { register } from 'prom-client';

@Controller()
export class MetricsController {
  @Get('/metrics')
  async index(@Res() res: Response): Promise<void> {
    res.header('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}
