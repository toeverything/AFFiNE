import type { RealtimeRequestName, RealtimeTopicName } from '@affine/realtime';

export const REALTIME_GATEWAY_REQUIRED_REQUESTS = [
  'workspace.access.get',
  'workspace.config.get',
  'workspace.members.get',
  'workspace.invite-link.get',
  'doc.share-state.get',
  'doc.grants.get',
  'user.profile.get',
  'user.settings.get',
  'notification.count.get',
  'comment.changes.get',
  'workspace.embedding.progress.get',
  'copilot.transcript.task.get',
  'user.quota-state.get',
  'workspace.quota-state.get',
] as const satisfies readonly RealtimeRequestName[];

export const REALTIME_GATEWAY_REQUIRED_TOPICS = [
  'workspace.access.changed',
  'workspace.config.changed',
  'workspace.members.changed',
  'workspace.invite-link.changed',
  'doc.share-state.changed',
  'doc.grants.changed',
  'user.profile.changed',
  'user.settings.changed',
  'notification.count.changed',
  'comment.changed',
  'workspace.embedding.progress.changed',
  'copilot.transcript.task.changed',
  'user.quota-state.changed',
  'workspace.quota-state.changed',
] as const satisfies readonly RealtimeTopicName[];
