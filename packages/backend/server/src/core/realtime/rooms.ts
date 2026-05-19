export function realtimeUserRoom(userId: string, scope: string) {
  return `user:${userId}:${scope}`;
}

export function realtimeWorkspaceRoom(workspaceId: string, scope: string) {
  return `workspace:${workspaceId}:${scope}`;
}

export function realtimeWorkspaceDocRoom(
  workspaceId: string,
  docId: string,
  scope: string
) {
  return `workspace:${workspaceId}:doc:${docId}:${scope}`;
}

export function realtimeTranscriptTaskRoom(
  workspaceId: string,
  taskId: string
) {
  return `copilot:transcript:${workspaceId}:${taskId}`;
}

export function realtimeNotificationRoom(userId: string) {
  return realtimeUserRoom(userId, 'notification');
}

export function realtimeCommentRoom(workspaceId: string, docId: string) {
  return realtimeWorkspaceDocRoom(workspaceId, docId, 'comment');
}

export function realtimeWorkspaceEmbeddingProgressRoom(workspaceId: string) {
  return realtimeWorkspaceRoom(workspaceId, 'embedding-progress');
}

export function realtimeUserQuotaStateRoom(userId: string) {
  return realtimeUserRoom(userId, 'quota-state');
}

export function realtimeWorkspaceQuotaStateRoom(workspaceId: string) {
  return realtimeWorkspaceRoom(workspaceId, 'quota-state');
}

export function realtimeWorkspaceAccessRoom(workspaceId: string) {
  return realtimeWorkspaceRoom(workspaceId, 'access');
}

export function realtimeWorkspaceConfigRoom(workspaceId: string) {
  return realtimeWorkspaceRoom(workspaceId, 'config');
}

export function realtimeWorkspaceMembersRoom(workspaceId: string) {
  return realtimeWorkspaceRoom(workspaceId, 'members');
}

export function realtimeWorkspaceInviteLinkRoom(workspaceId: string) {
  return realtimeWorkspaceRoom(workspaceId, 'invite-link');
}

export function realtimeDocShareStateRoom(workspaceId: string, docId: string) {
  return realtimeWorkspaceDocRoom(workspaceId, docId, 'share-state');
}

export function realtimeDocGrantsRoom(workspaceId: string, docId: string) {
  return realtimeWorkspaceDocRoom(workspaceId, docId, 'grants');
}

export function realtimeUserProfileRoom(userId: string) {
  return realtimeUserRoom(userId, 'profile');
}

export function realtimeUserSettingsRoom(userId: string) {
  return realtimeUserRoom(userId, 'settings');
}

export function realtimeUserAccessTokensRoom(userId: string) {
  return realtimeUserRoom(userId, 'access-tokens');
}
