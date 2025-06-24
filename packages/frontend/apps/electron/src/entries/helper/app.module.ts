import { Module } from '@nestjs/common';

import { ElectronIpcModule } from '../../ipc';
import { DialogModule } from './dialog';
import { HelperBootstrapService } from './helper-bootstrap.service';
import { LoggerModule } from './logger';
import { MainRpcModule } from './main-rpc';
import { NBStoreModule } from './nbstore';

/**
 * Main module for the helper process
 */
@Module({
  imports: [
    LoggerModule,
    ElectronIpcModule.forHelper(),
    MainRpcModule,
    // Feature modules
    DialogModule,
    NBStoreModule,
  ],
  providers: [HelperBootstrapService],
})
export class AppModule {}
