import './config';

import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { DocRpcController } from './controller';
import { DocServiceCronJob } from './job';

@Module({
  imports: [DocStorageModule],
  providers: [DocServiceCronJob],
  controllers: [DocRpcController],
})
export class DocServiceModule {}
