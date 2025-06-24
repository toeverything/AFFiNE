import { Module } from '@nestjs/common';

import { RecordingModule } from '../recording';
import { WindowsModule } from '../windows';
import { FindInPageService } from './find-in-page.service';
import { ProtocolService } from './protocol.service';
import { SecurityService } from './security.service';
import { TrayManager } from './tray.service';
import { UtilsHandleService } from './utils-handle.service';

@Module({
  providers: [
    ProtocolService,
    SecurityService,
    UtilsHandleService,
    FindInPageService,
    TrayManager,
  ],
  imports: [WindowsModule, RecordingModule],
})
export class MiscModule {}

export * from './deep-link.service';
export * from './protocol.service';
export * from './security.service';
export * from './utils-handle.service';
