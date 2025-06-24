import { Module } from '@nestjs/common';

import { UpdaterManagerService } from './updater-manager.service';

export * from './updater-manager.service';

@Module({
  providers: [UpdaterManagerService],
})
export class UpdaterModule {}
