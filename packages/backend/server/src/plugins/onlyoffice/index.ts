import './config';

import { Module } from '@nestjs/common';

import { PermissionModule } from '../../core/permission';
import { StorageModule } from '../../core/storage';
import { OnlyOfficeController } from './controller';
import { OnlyOfficeService } from './service';

@Module({
  imports: [PermissionModule, StorageModule],
  providers: [OnlyOfficeService],
  controllers: [OnlyOfficeController],
  exports: [OnlyOfficeService],
})
export class OnlyOfficeModule {}

export { OnlyOfficeService } from './service';
