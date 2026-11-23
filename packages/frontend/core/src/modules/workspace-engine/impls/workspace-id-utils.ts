export function normalizeWorkspaceIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string');
}

export function dedupeWorkspaceIds(ids: string[]): string[] {
  return [...new Set(ids)];
}
