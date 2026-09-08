import { Store } from '@toeverything/infra';
import { map } from 'rxjs';

import type { GlobalCache } from '../../storage';
import type { WorkspaceProfileInfo } from '../entities/profile';
import { type WorkspaceMetadata, workspaceMetadataKey } from '../metadata';

const WORKSPACE_PROFILE_CACHE_KEY = 'workspace-information:';

export class WorkspaceProfileCacheStore extends Store {
  constructor(private readonly cache: GlobalCache) {
    super();
  }

  watchProfileCache(metadata: WorkspaceMetadata) {
    return this.cache
      .watch(WORKSPACE_PROFILE_CACHE_KEY + workspaceMetadataKey(metadata))
      .pipe(
        map(data => {
          if (!data || typeof data !== 'object') {
            return null;
          }

          const info = data as WorkspaceProfileInfo;
          return info;
        })
      );
  }

  setProfileCache(metadata: WorkspaceMetadata, info: WorkspaceProfileInfo) {
    this.cache.set(
      WORKSPACE_PROFILE_CACHE_KEY + workspaceMetadataKey(metadata),
      info
    );
  }
}
