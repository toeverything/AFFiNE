import type { OnModuleDestroy } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { Config } from '../config';

@Injectable()
export class PrismaFactory implements OnModuleDestroy {
  static INSTANCE: PrismaClient | null = null;
  readonly #instance: PrismaClient;

  constructor(config: Config) {
    this.#instance = new PrismaClient(config.db.prisma);
    PrismaFactory.INSTANCE = this.#instance;
  }

  get() {
    return this.#instance;
  }

  async onModuleDestroy() {
    await PrismaFactory.INSTANCE?.$disconnect();
    PrismaFactory.INSTANCE = null;
  }
}
