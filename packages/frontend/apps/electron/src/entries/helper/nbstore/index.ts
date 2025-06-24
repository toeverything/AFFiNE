export { universalId } from '@affine/nbstore';

import { Module } from '@nestjs/common';

import { NBStoreService } from './nbstore.service';
import { LegacyDBHandlers } from './v1';
import { LegacyDBManager } from './v1/db-manager.service';
import { WorkspaceHandlersService } from './workspace-handlers.service';
import { WorkspacePathService } from './workspace-path.service';

@Module({
  providers: [
    LegacyDBHandlers,
    LegacyDBManager,
    NBStoreService,
    WorkspacePathService,
    WorkspaceHandlersService,
  ],
  exports: [
    LegacyDBManager,
    NBStoreService,
    WorkspacePathService,
    WorkspaceHandlersService,
  ],
})
export class NBStoreModule {}
