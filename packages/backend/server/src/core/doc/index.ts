import './config';

import { Module } from '@nestjs/common';

import { QuotaModule } from '../quota';
import { DocHistoryManager } from './history';
import { DocManager } from './manager';

@Module({
  imports: [QuotaModule],
  providers: [DocManager, DocHistoryManager],
  exports: [DocManager, DocHistoryManager],
})
export class DocModule {}

export { DocHistoryManager, DocManager };
