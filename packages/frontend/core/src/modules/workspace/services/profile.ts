import { ObjectPool, Service } from '@toeverything/infra';

import { WorkspaceProfile } from '../entities/profile';
import { type WorkspaceMetadata, workspaceMetadataKey } from '../metadata';

export class WorkspaceProfileService extends Service {
  pool = new ObjectPool<string, WorkspaceProfile>();

  getProfile = (metadata: WorkspaceMetadata): WorkspaceProfile => {
    const key = workspaceMetadataKey(metadata);
    const exists = this.pool.get(key);
    if (exists) {
      return exists.obj;
    }

    const profile = this.framework.createEntity(WorkspaceProfile, {
      metadata,
    });

    return this.pool.put(key, profile).obj;
  };
}
