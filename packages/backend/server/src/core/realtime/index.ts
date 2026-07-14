import { Global, Module } from '@nestjs/common';

import { RealtimeRegistryCompletenessChecker } from './completeness';
import { RealtimeGateway } from './gateway';
import { RealtimePublisher } from './publisher';
import { RealtimeRegistry } from './registry';

@Global()
@Module({
  providers: [
    RealtimeRegistry,
    RealtimePublisher,
    RealtimeGateway,
    RealtimeRegistryCompletenessChecker,
  ],
  exports: [RealtimeRegistry, RealtimePublisher],
})
export class RealtimeModule {}

export { RealtimeRegistryCompletenessChecker } from './completeness';
export { registerRealtimeLiveQuery } from './provider';
export { RealtimePublisher } from './publisher';
export { RealtimeRegistry } from './registry';
export {
  REALTIME_GATEWAY_REQUIRED_REQUESTS,
  REALTIME_GATEWAY_REQUIRED_TOPICS,
} from './required-handlers';
export {
  realtimeCommentRoom,
  realtimeDocGrantsRoom,
  realtimeDocShareStateRoom,
  realtimeNotificationRoom,
  realtimeTranscriptTaskRoom,
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
