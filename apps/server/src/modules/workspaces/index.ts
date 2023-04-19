import { Module } from '@nestjs/common';

import { WorkspaceResolver } from './resolver';

@Module({
  providers: [WorkspaceResolver],
})
export class WorkspaceModule {}
