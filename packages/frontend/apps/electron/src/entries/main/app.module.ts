import { Module } from '@nestjs/common';

import { ElectronIpcModule } from '../../ipc';
import { HelperProcessModule } from './helper-process';
import { LoggerModule } from './logger';
import { MiscModule } from './misc';
import { StorageModule } from './storage';
import { UpdaterModule } from './updater';
import { WindowsModule } from './windows';

@Module({
  imports: [
    WindowsModule,
    LoggerModule,
    ElectronIpcModule.forMain(),
    HelperProcessModule,
    StorageModule,
    UpdaterModule,
    MiscModule,
  ],
})
export class AppModule {}
