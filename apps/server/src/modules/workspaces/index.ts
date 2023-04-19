import { Module } from '@nestjs/common';

import { WorkspaceResolver } from './resolver';

@Module({
  providers: [WorkspaceResolver],
  exports: [],
})
export class WorkspaceModule {}
export { WorkspaceType } from './resolver';
