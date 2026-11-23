import './config';

import { Module } from '@nestjs/common';

import { WorkerController } from './controller';
import { WorkerService } from './service';
@Module({
  providers: [WorkerService],
  controllers: [WorkerController],
})
export class WorkerModule {}
