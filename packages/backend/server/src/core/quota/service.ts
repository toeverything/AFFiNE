import { Injectable, Logger } from '@nestjs/common';

import { InternalServerError, MemberQuotaExceeded, OnEvent } from '../../base';
import {
  Models,
  type UserQuota,
  WorkspaceQuota as BaseWorkspaceQuota,
  WorkspaceRole,
} from '../../models';
import { WorkspaceBlobStorage } from '../storage';
import {
  UserQuotaHumanReadableType,
  UserQuotaType,
  WorkspaceQuotaHumanReadableType,
  WorkspaceQuotaType,
} from './types';
import { formatDate, formatSize } from './utils';

type UserQuotaWithUsage = Omit<UserQuotaType, 'humanReadable'>;
type WorkspaceQuota = Omit<BaseWorkspaceQuota, 'seatQuota'> & {
  ownerQuota?: string;
};
type WorkspaceQuotaWithUsage = Omit<WorkspaceQuotaType, 'humanReadable'>;

@Injectable()
export class QuotaService {
  protected logger = new Logger(QuotaService.name);

  constructor(
    private readonly models: Models,
    private readonly storage: WorkspaceBlobStorage
  ) {}

  @OnEvent('user.postCreated')
  async onUserCreated({ id }: Events['user.postCreated']) {
    await this.setupUserBaseQuota(id);
  }

  async getUserQuota(userId: string): Promise<UserQuota> {
    let quota = await this.models.userFeature.getQuota(userId);

    // not possible, but just in case, we do a little fix for user to avoid system dump
    if (!quota) {
      await this.setupUserBaseQuota(userId);
      quota = await this.models.userFeature.getQuota(userId);
    }

    const unlimitedCopilot = await this.models.userFeature.has(
      userId,
      'unlimited_copilot'
    );

    if (!quota) {
      throw new InternalServerError(
        'User quota not found and can not be created.'
      );
    }

    return {
      ...quota.configs,
      copilotActionLimit: unlimitedCopilot
        ? undefined
        : quota.configs.copilotActionLimit,
    } as UserQuotaWithUsage;
  }

  async getUserQuotaWithUsage(userId: string): Promise<UserQuotaWithUsage> {
    const quota = await this.getUserQuota(userId);
    const usedStorageQuota = await this.getUserStorageUsage(userId);

    return { ...quota, usedStorageQuota };
  }

  async getUserStorageUsage(userId: string) {
    const workspaces = await this.models.workspaceUser.getUserActiveRoles(
      userId,
      {
        role: WorkspaceRole.Owner,
      }
    );

    const ids = workspaces.map(w => w.workspaceId);

    const workspacesWithQuota =
      await this.models.workspaceFeature.batchHasQuota(ids);

    const sizes = await Promise.allSettled(
      ids
        .filter(w => !workspacesWithQuota.includes(w))
        .map(workspace => this.storage.totalSize(workspace))
    );

    return sizes.reduce((total, size) => {
      if (size.status === 'fulfilled') {
        // ensure that size is within the safe range of gql
        const totalSize = total + size.value;
        if (Number.isSafeInteger(totalSize)) {
          return totalSize;
        } else {
          this.logger.error(`Workspace size is invalid: ${size.value}`);
        }
      } else {
        this.logger.error(`Failed to get workspace size`, size.reason);
      }
      return total;
    }, 0);
  }

  async getWorkspaceStorageUsage(workspaceId: string) {
    const totalSize = await this.storage.totalSize(workspaceId);
    // ensure that size is within the safe range of gql
    if (Number.isSafeInteger(totalSize)) {
      return totalSize;
    } else {
      this.logger.error(`Workspace size is invalid: ${totalSize}`);
    }

    return 0;
  }

  async getWorkspaceQuota(workspaceId: string): Promise<WorkspaceQuota> {
    const quota = await this.models.workspaceFeature.getQuota(workspaceId);

    if (!quota) {
      // get and convert to workspace quota from owner's quota
      const owner = await this.models.workspaceUser.getOwner(workspaceId);
      const ownerQuota = await this.getUserQuota(owner.id);

      return {
        ...ownerQuota,
        ownerQuota: owner.id,
      };
    }

    return quota.configs;
  }

  async getWorkspaceQuotaWithUsage(
    workspaceId: string
  ): Promise<WorkspaceQuotaWithUsage> {
    const quota = await this.getWorkspaceQuota(workspaceId);
    const usedStorageQuota = quota.ownerQuota
      ? await this.getUserStorageUsage(quota.ownerQuota)
      : await this.getWorkspaceStorageUsage(workspaceId);
    const memberCount =
      await this.models.workspaceUser.chargedCount(workspaceId);
    const overcapacityMemberCount = memberCount - quota.memberLimit;

    return {
      ...quota,
      usedStorageQuota,
      memberCount,
      overcapacityMemberCount,
      usedSize: usedStorageQuota,
    };
  }

  formatUserQuota(
    quota: Omit<UserQuotaType, 'humanReadable'>
  ): UserQuotaHumanReadableType {
    return {
      name: quota.name,
      blobLimit: formatSize(quota.blobLimit),
      storageQuota: formatSize(quota.storageQuota),
      usedStorageQuota: formatSize(quota.usedStorageQuota),
      historyPeriod: formatDate(quota.historyPeriod),
      memberLimit: quota.memberLimit.toString(),
      copilotActionLimit: quota.copilotActionLimit
        ? `${quota.copilotActionLimit} times`
        : 'Unlimited',
    };
  }

  async getWorkspaceSeatQuota(workspaceId: string) {
    const quota = await this.getWorkspaceQuota(workspaceId);
    const memberCount =
      await this.models.workspaceUser.chargedCount(workspaceId);

    return {
      memberCount,
      memberLimit: quota.memberLimit,
    };
  }

  async tryCheckSeat(workspaceId: string, excludeSelf = false) {
    const quota = await this.getWorkspaceSeatQuota(workspaceId);

    return quota.memberCount - (excludeSelf ? 1 : 0) < quota.memberLimit;
  }

  async checkSeat(workspaceId: string, excludeSelf = false) {
    const available = await this.tryCheckSeat(workspaceId, excludeSelf);

    if (!available) {
      throw new MemberQuotaExceeded();
    }
  }

  formatWorkspaceQuota(
    quota: Omit<WorkspaceQuotaType, 'humanReadable'>
  ): WorkspaceQuotaHumanReadableType {
    return {
      name: quota.name,
      blobLimit: formatSize(quota.blobLimit),
      storageQuota: formatSize(quota.storageQuota),
      storageQuotaUsed: formatSize(quota.usedStorageQuota),
      historyPeriod: formatDate(quota.historyPeriod),
      memberLimit: quota.memberLimit.toString(),
      memberCount: quota.memberCount.toString(),
      overcapacityMemberCount: quota.overcapacityMemberCount.toString(),
    };
  }

  async getUserQuotaCalculator(userId: string) {
    const quota = await this.getUserQuota(userId);
    const usedSize = await this.getUserStorageUsage(userId);

    return this.generateQuotaCalculator(
      quota.storageQuota,
      quota.blobLimit,
      usedSize
    );
  }

  async getWorkspaceQuotaCalculator(workspaceId: string) {
    const quota = await this.getWorkspaceQuota(workspaceId);
    const unlimited = await this.models.workspaceFeature.has(
      workspaceId,
      'unlimited_workspace'
    );

    // quota check will be disabled for unlimited workspace
    // we save a complicated db read for used size
    if (unlimited) {
      return this.generateQuotaCalculator(0, quota.blobLimit, 0, true);
    }

    const usedSize = quota.ownerQuota
      ? await this.getUserStorageUsage(quota.ownerQuota)
      : await this.getWorkspaceStorageUsage(workspaceId);

    return this.generateQuotaCalculator(
      quota.storageQuota,
      quota.blobLimit,
      usedSize
    );
  }

  private async setupUserBaseQuota(userId: string) {
    await this.models.userFeature.add(userId, 'free_plan_v1', 'sign up');
  }

  private generateQuotaCalculator(
    storageQuota: number,
    blobLimit: number,
    usedQuota: number,
    unlimited = false
  ) {
    const checkExceeded = (recvSize: number) => {
      const currentSize = usedQuota + recvSize;
      // only skip total storage check if workspace has unlimited feature
      if (currentSize > storageQuota && !unlimited) {
        this.logger.warn(
          `storage size limit exceeded: ${currentSize} > ${storageQuota}`
        );
        return { storageQuotaExceeded: true, blobQuotaExceeded: false };
      } else if (recvSize > blobLimit) {
        this.logger.warn(
          `blob size limit exceeded: ${recvSize} > ${blobLimit}`
        );
        return { storageQuotaExceeded: false, blobQuotaExceeded: true };
      } else {
        return;
      }
    };
    return checkExceeded;
  }
}
