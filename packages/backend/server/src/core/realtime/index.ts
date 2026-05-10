import { Global, Module } from '@nestjs/common';

import { RealtimeGateway } from './gateway';
import { RealtimePublisher } from './publisher';
import { RealtimeRegistry } from './registry';

@Global()
@Module({
  providers: [RealtimeRegistry, RealtimePublisher, RealtimeGateway],
  exports: [RealtimeRegistry, RealtimePublisher],
})
export class RealtimeModule {}

export { registerRealtimeLiveQuery } from './provider';
export { RealtimePublisher } from './publisher';
export { RealtimeRegistry } from './registry';
export {
  realtimeCommentRoom,
  realtimeNotificationRoom,
  realtimeTranscriptTaskRoom,
  realtimeUserRoom,
  realtimeWorkspaceDocRoom,
  realtimeWorkspaceEmbeddingProgressRoom,
  realtimeWorkspaceRoom,
} from './rooms';
export type { RealtimeRequestHandler, RealtimeTopicHandler } from './types';
