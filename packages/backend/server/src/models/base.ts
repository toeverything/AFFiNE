import { Inject, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

import type { Models } from '.';
import { MODELS_SYMBOL } from './provider';

export class BaseModel {
  protected readonly logger = new Logger(this.constructor.name);

  @Inject(MODELS_SYMBOL)
  protected readonly models!: Models;

  @Inject(TransactionHost)
  private readonly txHost!: TransactionHost<TransactionalAdapterPrisma>;

  protected get db() {
    // When a transaction is not active, the Transaction instance refers to the default non-transactional instance.
    // See https://papooch.github.io/nestjs-cls/plugins/available-plugins/transactional#using-the-injecttransaction-decorator
    return this.txHost.tx;
  }
}
