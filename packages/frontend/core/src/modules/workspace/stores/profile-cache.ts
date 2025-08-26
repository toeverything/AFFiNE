import { Store } from '@toeverything/infra';
import { map } from 'rxjs';

import type { GlobalCache } from '../../storage';
import type { WorkspaceProfileInfo } from '../entities/profile';

const WORKSPACE_PROFILE_CACHE_KEY = 'workspace-information:';

export class WorkspaceProfileCacheStore extends Store {
  constructor(private readonly cache: GlobalCache) {
    super();
  }

  watchProfileCache(workspaceId: string) {
    return this.cache.watch(WORKSPACE_PROFILE_CACHE_KEY + workspaceId).pipe(
      map(data => {
        if (!data || typeof data !== 'object') {
          return null;
        }

        const info = data as WorkspaceProfileInfo;
        return info;
      })
    );
  }

  setProfileCache(workspaceId: string, info: WorkspaceProfileInfo) {
    this.cache.set(WORKSPACE_PROFILE_CACHE_KEY + workspaceId, info);
  }
}
