import { Module } from '@nestjs/common';

import { DocStorageModule, DocStorageWorkerModule } from '../doc';
import { DocJobConsumer, DocJobScheduler } from './job';

@Module({
  imports: [DocStorageModule, DocStorageWorkerModule],
  providers: [DocJobConsumer, DocJobScheduler],
})
export class DocJobsModule {}
