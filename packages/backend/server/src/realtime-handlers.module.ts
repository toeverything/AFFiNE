import { Module } from '@nestjs/common';

import { CommentRealtimeModule } from './core/comment';
import { WorkspaceRealtimeModule } from './core/workspaces';
import { CopilotRealtimeModule } from './plugins/copilot';

@Module({
  imports: [
    WorkspaceRealtimeModule,
    CommentRealtimeModule,
    CopilotRealtimeModule,
  ],
})
export class ServerRealtimeHandlersModule {}
