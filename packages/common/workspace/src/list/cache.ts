import { type WorkspaceMetadata } from '../metadata';

const CACHE_STORAGE_KEY = 'jotai-workspaces';

export function readWorkspaceListCache() {
  const metadata = localStorage.getItem(CACHE_STORAGE_KEY);
  if (metadata) {
    try {
      const items = JSON.parse(metadata) as WorkspaceMetadata[];
      return [...items];
    } catch (e) {
      console.error('cannot parse worksapce', e);
    }
    return [];
  }
  return [];
}

export function writeWorkspaceListCache(metadata: WorkspaceMetadata[]) {
  localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(metadata));
}
