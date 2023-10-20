import type { Storage } from '@affine/storage';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { StorageProvide } from '../../storage';
import { PermissionService } from '../workspaces/permission';
import { QuotaService } from './configure';

@Injectable()
export class QuotaManagementService {
  constructor(
    private readonly quota: QuotaService,
    private readonly permissions: PermissionService,
    @Inject(StorageProvide) private readonly storage: Storage
  ) {}

  async getUserQuota(userId: string) {
    const quota = await this.quota.getUserQuota(userId);
    if (quota) {
      return {
        name: quota.feature.feature,
        reason: quota.reason,
        createAt: quota.createdAt,
        expiresAt: quota.expiresAt,
        blobLimit: quota.feature.configs.blobLimit,
        storageQuota: quota.feature.configs.storageQuota,
      };
    }
    return null;
  }

  // TODO: lazy calc, need to be optimized with cache
  async getUserUsage(userId: string) {
    const workspaces = await this.permissions.getOwnedWorkspaces(userId);
    return this.storage.blobsSize(workspaces);
  }

  // get workspace's owner quota and total size of used
  // quota was apply to owner's account
  async getWorkspaceUsage(workspaceId: string) {
    const { user: owner } =
      await this.permissions.getWorkspaceOwner(workspaceId);
    if (!owner) throw new NotFoundException('Workspace owner not found');
    const { storageQuota } = (await this.getUserQuota(owner.id)) || {};
    // get all workspaces size of owner used
    const usageSize = await this.getUserUsage(owner.id);

    return { quota: storageQuota, size: usageSize };
  }

  async checkBlobQuota(workspaceId: string, size: number) {
    const { quota, size: usageSize } =
      await this.getWorkspaceUsage(workspaceId);
    if (typeof quota !== 'number') {
      throw new ForbiddenException(`user's quota not exists`);
    }

    return quota - (size + usageSize);
  }
}
