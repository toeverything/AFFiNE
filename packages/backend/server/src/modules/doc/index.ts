import { Module } from '@nestjs/common';

import { DocHistoryManager } from './history';
import { DocManager } from './manager';

@Module({
  providers: [DocManager, DocHistoryManager],
  exports: [DocManager, DocHistoryManager],
})
export class DocModule {}

export { DocHistoryManager, DocManager };
