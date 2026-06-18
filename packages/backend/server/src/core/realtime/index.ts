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
  realtimeDocGrantsRoom,
  realtimeDocShareStateRoom,
  realtimeNotificationRoom,
  realtimeTranscriptTaskRoom,
  realtimeUserAccessTokensRoom,
  realtimeUserProfileRoom,
  realtimeUserQuotaStateRoom,
  realtimeUserRoom,
  realtimeUserSettingsRoom,
  realtimeWorkspaceAccessRoom,
  realtimeWorkspaceConfigRoom,
  realtimeWorkspaceDocRoom,
  realtimeWorkspaceEmbeddingProgressRoom,
  realtimeWorkspaceInviteLinkRoom,
  realtimeWorkspaceMembersRoom,
  realtimeWorkspaceQuotaStateRoom,
  realtimeWorkspaceRoom,
} from './rooms';
export type { RealtimeRequestHandler, RealtimeTopicHandler } from './types';
