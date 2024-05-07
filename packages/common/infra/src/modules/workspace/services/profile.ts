import { Service } from '../../../framework';
import { ObjectPool } from '../../../utils';
import { WorkspaceProfile } from '../entities/profile';
import type { WorkspaceMetadata } from '../metadata';

export class WorkspaceProfileService extends Service {
  pool = new ObjectPool<string, WorkspaceProfile>();

  getProfile = (metadata: WorkspaceMetadata): WorkspaceProfile => {
    const exists = this.pool.get(metadata.id);
    if (exists) {
      return exists.obj;
    }

    const profile = this.framework.createEntity(WorkspaceProfile, {
      metadata,
    });

    return this.pool.put(metadata.id, profile).obj;
  };
}
