import type { Storage } from '@affine/storage';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { StorageProvide } from '../../../storage';
import { PermissionService } from '../../workspaces/permission';
import { QuotaService } from '../quota';

@Injectable()
export class StorageQuotaService {
  constructor(
    private readonly quota: QuotaService,
    private readonly permissions: PermissionService,
    @Inject(StorageProvide) private readonly storage: Storage
  ) {}

  async getQuotaByUser(userId: string) {
    const quota = await this.quota.getQuotaByUser(userId);
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
  async getWorkspacesSize(userId: string) {
    const workspaces = await this.permissions.getOwnedWorkspaces(userId);
    return this.storage.blobsSize(workspaces);
  }

  // get workspace's owner quota and total size of used
  // quota was apply to owner's account
  async getWorkspaceQuota(workspaceId: string) {
    const { user: owner } =
      await this.permissions.getWorkspaceOwner(workspaceId);
    if (!owner) throw new NotFoundException('Workspace owner not found');
    const { storageQuota: totalQuota } =
      (await this.getQuotaByUser(owner.id)) || {};
    // get all workspaces size of owner used
    const totalSize = await this.getWorkspacesSize(owner.id);

    return { totalQuota, totalSize };
  }

  async checkBlobQuota(workspaceId: string, size: number) {
    const { totalQuota, totalSize } = await this.getWorkspaceQuota(workspaceId);
    if (typeof totalQuota !== 'number') {
      throw new ForbiddenException(`user's quota not exists`);
    }

    return totalQuota - (size + totalSize);
  }
}
