import { Injectable } from '@nestjs/common';

import { Config } from '../../config';
import { PrismaService } from '../../prisma';

@Injectable()
export class QuotaManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: Config
  ) {}
}
