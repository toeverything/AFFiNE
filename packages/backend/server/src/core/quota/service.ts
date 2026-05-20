import { Injectable, Logger } from '@nestjs/common';

import { MemberQuotaExceeded, OnEvent } from '../../base';
import {
  type UserQuota,
  WorkspaceQuota as BaseWorkspaceQuota,
} from '../../models';
import { QuotaStateService } from './state';
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
export type WorkspaceQuotaWithUsage = Omit<
  WorkspaceQuotaType,
  'humanReadable'
> & { ownerQuota?: string };

@Injectable()
export class QuotaService {
  protected logger = new Logger(QuotaService.name);

  constructor(private readonly quotaState: QuotaStateService) {}

  @OnEvent('user.postCreated')
  async onUserCreated({ id }: Events['user.postCreated']) {
    await this.setupUserBaseQuota(id);
  }

  async getUserQuota(userId: string): Promise<UserQuota> {
    const state = await this.quotaState.reconcileUserQuotaState(userId);

    return this.userQuotaFromState(state);
  }

  async getUserQuotaWithUsage(userId: string): Promise<UserQuotaWithUsage> {
    const state = await this.quotaState.reconcileUserQuotaState(userId);
    const quota = this.userQuotaFromState(state);

    return { ...quota, usedStorageQuota: Number(state.usedStorageQuota) };
  }

  async getUserStorageUsage(userId: string) {
    const state = await this.quotaState.reconcileUserQuotaState(userId);
    return Number(state.usedStorageQuota);
  }

  async getWorkspaceStorageUsage(workspaceId: string) {
    const state =
      await this.quotaState.reconcileWorkspaceQuotaState(workspaceId);
    return Number(state.usedStorageQuota);
  }

  async getWorkspaceQuota(workspaceId: string): Promise<WorkspaceQuota> {
    const state =
      await this.quotaState.reconcileWorkspaceQuotaState(workspaceId);
    return this.workspaceQuotaFromState(state);
  }

  async getWorkspaceQuotaWithUsage(
    workspaceId: string
  ): Promise<WorkspaceQuotaWithUsage> {
    const state =
      await this.quotaState.reconcileWorkspaceQuotaState(workspaceId);
    const quota = this.workspaceQuotaFromState(state);

    return {
      ...quota,
      usedStorageQuota: Number(state.usedStorageQuota),
      memberCount: state.memberCount,
      overcapacityMemberCount: state.overcapacityMemberCount,
      usedSize: Number(state.usedStorageQuota),
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
    const state =
      await this.quotaState.reconcileWorkspaceQuotaState(workspaceId);

    return {
      memberCount: state.memberCount,
      memberLimit: state.seatLimit,
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
    const quota = await this.getUserQuotaWithUsage(userId);

    return this.generateQuotaCalculator(
      quota.storageQuota,
      quota.blobLimit,
      quota.usedStorageQuota
    );
  }

  async getWorkspaceQuotaCalculator(workspaceId: string) {
    const quota = await this.getWorkspaceQuotaWithUsage(workspaceId);

    return this.generateQuotaCalculator(
      quota.storageQuota,
      quota.blobLimit,
      quota.usedStorageQuota
    );
  }

  private async setupUserBaseQuota(userId: string) {
    await this.quotaState.reconcileUserQuotaState(userId);
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

  private userQuotaFromState(
    state: Awaited<ReturnType<QuotaStateService['reconcileUserQuotaState']>>
  ): UserQuota {
    const flags = state.flags as { unlimitedCopilot?: boolean };
    return {
      name: this.planName(state.plan),
      blobLimit: Number(state.blobLimit),
      storageQuota: Number(state.storageQuota),
      historyPeriod: state.historyPeriodSeconds,
      memberLimit: this.userMemberLimit(state.plan),
      copilotActionLimit: flags.unlimitedCopilot
        ? undefined
        : (state.copilotActionLimit ?? undefined),
    };
  }

  private workspaceQuotaFromState(
    state: Awaited<
      ReturnType<QuotaStateService['reconcileWorkspaceQuotaState']>
    >
  ): WorkspaceQuota {
    return {
      name: this.planName(state.plan),
      blobLimit: Number(state.blobLimit),
      storageQuota: Number(state.storageQuota),
      historyPeriod: state.historyPeriodSeconds,
      memberLimit: state.seatLimit,
      ownerQuota: state.usesOwnerQuota
        ? (state.ownerUserId ?? undefined)
        : undefined,
    };
  }

  private userMemberLimit(plan: string) {
    return plan === 'pro' || plan === 'lifetime_pro' || plan === 'selfhost_free'
      ? 10
      : 3;
  }

  private planName(plan: string) {
    switch (plan) {
      case 'pro':
      case 'selfhost_free':
        return 'Pro';
      case 'lifetime_pro':
        return 'Lifetime Pro';
      case 'ai':
        return 'AI';
      case 'team':
      case 'selfhost_team':
        return 'Team';
      default:
        return 'Free';
    }
  }
}
