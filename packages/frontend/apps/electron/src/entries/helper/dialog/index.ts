import { Module } from '@nestjs/common';

import { NBStoreModule } from '../nbstore';
import { DialogHandlerService } from './dialog-handler.service';

/**
 * Module that provides dialog functionality for the helper process
 */
@Module({
  providers: [DialogHandlerService],
  exports: [DialogHandlerService],
  imports: [NBStoreModule],
})
export class DialogModule {}
