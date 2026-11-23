import { Module } from '@nestjs/common';

import { DocStorageModule, DocStorageWorkerModule } from '../doc';
import { DocJobRunner } from './job';

@Module({
  imports: [DocStorageModule, DocStorageWorkerModule],
  providers: [DocJobRunner],
})
export class DocJobsModule {}
