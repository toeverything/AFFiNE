import { Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { PermissionModule } from '../permission';
import { DocRendererController } from './controller';
import { DocContentService } from './service';

@Module({
  imports: [DocStorageModule, PermissionModule],
  providers: [DocContentService],
  controllers: [DocRendererController],
  exports: [DocContentService],
})
export class DocRendererModule {}

export { DocContentService };
