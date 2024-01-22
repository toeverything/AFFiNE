import { Injectable, NotFoundException } from '@nestjs/common';

import { WorkspaceBlobStorage } from '../storage';
import { PermissionService } from '../workspaces/permission';
import { QuotaService } from './service';
import { QuotaQueryType } from './types';

@Injectable()
export class QuotaManagementService {
  constructor(
    private readonly quota: QuotaService,
    private readonly permissions: PermissionService,
    private readonly storage: WorkspaceBlobStorage
  ) {}

  async getUserQuota(userId: string) {
    const quota = await this.quota.getUserQuota(userId);

    return {
      name: quota.feature.name,
      reason: quota.reason,
      createAt: quota.createdAt,
      expiredAt: quota.expiredAt,
      blobLimit: quota.feature.blobLimit,
      storageQuota: quota.feature.storageQuota,
      historyPeriod: quota.feature.historyPeriod,
      memberLimit: quota.feature.memberLimit,
    };
  }

  // TODO: lazy calc, need to be optimized with cache
  async getUserUsage(userId: string) {
    const workspaces = await this.permissions.getOwnedWorkspaces(userId);

    const sizes = await Promise.all(
      workspaces.map(workspace => this.storage.totalSize(workspace))
    );

    return sizes.reduce((total, size) => total + size, 0);
  }

  // get workspace's owner quota and total size of used
  // quota was apply to owner's account
  async getWorkspaceUsage(workspaceId: string): Promise<QuotaQueryType> {
    const { user: owner } =
      await this.permissions.getWorkspaceOwner(workspaceId);
    if (!owner) throw new NotFoundException('Workspace owner not found');
    const { storageQuota, blobLimit } = await this.getUserQuota(owner.id);
    // get all workspaces size of owner used
    const usedSize = await this.getUserUsage(owner.id);

    return { storageQuota, usedSize, blobLimit };
  }

  async checkBlobQuota(workspaceId: string, size: number) {
    const { storageQuota, usedSize } =
      await this.getWorkspaceUsage(workspaceId);

    return storageQuota - (size + usedSize);
  }
}
