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
