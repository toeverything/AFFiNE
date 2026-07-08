import { Module } from '@nestjs/common';

import { CommentRealtimeModule } from './core/comment';
import { WorkspaceRealtimeModule } from './core/workspaces';
import {
  CopilotEmbeddingRealtimeModule,
  CopilotRealtimeModule,
} from './plugins/copilot';

@Module({
  imports: [
    WorkspaceRealtimeModule,
    CommentRealtimeModule,
    CopilotEmbeddingRealtimeModule,
    CopilotRealtimeModule,
  ],
})
export class ServerRealtimeHandlersModule {}
