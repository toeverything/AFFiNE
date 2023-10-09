import { Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';

@Injectable()
export class QuotaUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: Config
  ) {}
}
