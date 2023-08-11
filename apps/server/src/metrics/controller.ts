import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { register } from 'prom-client';

import { PrismaService } from '../prisma';

@Controller()
export class MetricsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/metrics')
  async index(@Res() res: Response): Promise<void> {
    res.header('Content-Type', register.contentType);
    const prismaMetrics = await this.prisma.$metrics.prometheus();
    const appMetrics = await register.metrics();
    res.send(appMetrics + prismaMetrics);
  }
}
