import type { GlobalCache } from '../../storage';
import { type WorkspaceMetadata } from '../metadata';

const CACHE_STORAGE_KEY = 'jotai-workspaces';

export function readWorkspaceListCache(cache: GlobalCache) {
  const metadata = cache.get(CACHE_STORAGE_KEY);
  if (metadata) {
    try {
      const items = metadata as WorkspaceMetadata[];
      return [...items];
    } catch (e) {
      console.error('cannot parse worksapce', e);
    }
    return [];
  }
  return [];
}

export function writeWorkspaceListCache(
  cache: GlobalCache,
  metadata: WorkspaceMetadata[]
) {
  cache.set(CACHE_STORAGE_KEY, metadata);
}
