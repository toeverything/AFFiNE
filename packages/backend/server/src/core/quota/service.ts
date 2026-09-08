import { Injectable, Logger } from '@nestjs/common';

import {
  type UserQuota,
  WorkspaceQuota as BaseWorkspaceQuota,
} from '../../models';
import { BackendRuntimeProvider } from '../backend-runtime';
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

  constructor(private readonly runtime: BackendRuntimeProvider) {}

  async getUserQuota(userId: string): Promise<UserQuota> {
    const state = await this.runtime.getUserQuotaStateV1(userId);

    return this.userQuotaFromState(state);
  }

  async getUserQuotaWithUsage(userId: string): Promise<UserQuotaWithUsage> {
    const state = await this.runtime.getUserQuotaStateV1(userId);
    const quota = this.userQuotaFromState(state);

    return { ...quota, usedStorageQuota: Number(state.usedStorageQuota) };
  }

  async getUserStorageUsage(userId: string) {
    const state = await this.runtime.getUserQuotaStateV1(userId);
    return Number(state.usedStorageQuota);
  }

  async getWorkspaceStorageUsage(workspaceId: string) {
    const state = await this.runtime.getWorkspaceQuotaStateV1(workspaceId);
    return Number(state.usedStorageQuota);
  }

  async getWorkspaceQuota(workspaceId: string): Promise<WorkspaceQuota> {
    const state = await this.runtime.getWorkspaceQuotaStateV1(workspaceId);
    return this.workspaceQuotaFromState(state);
  }

  async getWorkspaceQuotaWithUsage(
    workspaceId: string
  ): Promise<WorkspaceQuotaWithUsage> {
    const state = await this.runtime.getWorkspaceQuotaStateV1(workspaceId);
    const quota = this.workspaceQuotaFromState(state);

    return {
      ...quota,
      usedStorageQuota: Number(state.usedStorageQuota),
      memberCount: state.memberCount,
      overcapacityMemberCount: state.overcapacityMemberCount,
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
    const state = await this.runtime.getWorkspaceQuotaStateV1(workspaceId);

    return {
      memberCount: state.memberCount,
      memberLimit: state.seatLimit,
    };
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

  private userQuotaFromState(
    state: Awaited<ReturnType<BackendRuntimeProvider['getUserQuotaStateV1']>>
  ): UserQuota {
    return {
      name: this.planName(state.plan),
      blobLimit: Number(state.blobLimit),
      storageQuota: Number(state.storageQuota),
      historyPeriod: state.historyPeriodSeconds,
      memberLimit: state.seatLimit,
      copilotActionLimit: state.unlimitedCopilot
        ? undefined
        : (state.copilotActionLimit ?? undefined),
    };
  }

  private workspaceQuotaFromState(
    state: Awaited<
      ReturnType<BackendRuntimeProvider['getWorkspaceQuotaStateV1']>
    >
  ): WorkspaceQuota {
    return {
      name: this.planName(state.plan),
      blobLimit: Number(state.blobLimit),
      storageQuota: Number(state.storageQuota),
      historyPeriod: state.historyPeriodSeconds,
      memberLimit: state.seatLimit,
      ownerQuota: state.usesOwnerQuota ? state.ownerUserId : undefined,
    };
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
