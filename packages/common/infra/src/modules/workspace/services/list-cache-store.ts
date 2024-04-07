import { map } from 'rxjs';

import { Service } from '../../../framework';
import type { GlobalCache } from '../../storage';
import type { WorkspaceMetadata } from '../metadata';

const CACHE_STORAGE_KEY = 'jotai-workspaces';

export class WorkspaceListCacheStoreService extends Service {
  constructor(private readonly cache: GlobalCache) {
    super();
  }

  watchCachedWorkspaces() {
    return this.cache.watch(CACHE_STORAGE_KEY).pipe(
      map(metadata => {
        if (metadata && Array.isArray(metadata)) {
          return metadata;
        }
        return [];
      })
    );
  }

  setCachedWorkspaces(workspaces: WorkspaceMetadata[]) {
    this.cache.set(CACHE_STORAGE_KEY, workspaces);
  }
}
