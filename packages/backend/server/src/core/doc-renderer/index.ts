import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { PermissionModule } from '../permission';
import { DocRendererController } from './controller';

@Module({
  imports: [DocStorageModule, PermissionModule],
  controllers: [DocRendererController],
})
export class DocRendererModule {}
