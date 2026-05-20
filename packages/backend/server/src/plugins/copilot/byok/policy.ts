import { Injectable } from '@nestjs/common';

import { ActionForbidden } from '../../../base';
import { QuotaStateService } from '../../../core/quota/state';
import { Models, WorkspaceRole } from '../../../models';

@Injectable()
export class ByokEntitlementPolicy {
  constructor(
    private readonly models: Models,
    private readonly quotaState: QuotaStateService
  ) {}

  async hasAiPlan(userId?: string) {
    if (!userId) return false;
    const state = await this.quotaState.reconcileUserQuotaState(userId);
    const flags = state.flags as { unlimitedCopilot?: boolean };
    return (
      flags.unlimitedCopilot ||
      ['pro', 'lifetime_pro', 'ai'].includes(state.plan)
    );
  }

  async hasManagementAccess(workspaceId: string, userId?: string) {
    if (!userId) return false;
    const role = await this.models.workspaceUser.getActive(workspaceId, userId);
    return (
      role?.type === WorkspaceRole.Owner || role?.type === WorkspaceRole.Admin
    );
  }

  async assertManagementAccess(workspaceId: string, userId?: string) {
    if (!(await this.hasManagementAccess(workspaceId, userId))) {
      throw new ActionForbidden(
        'BYOK settings require workspace owner or admin.'
      );
    }
  }

  private async getWorkspaceOwnerId(workspaceId: string) {
    const workspace = await this.models.workspace.get(workspaceId);
    if (!workspace) {
      return null;
    }

    try {
      return (await this.models.workspaceUser.getOwner(workspaceId)).id;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Workspace owner not found'
      ) {
        return null;
      }
      throw error;
    }
  }

  async hasLocalEntitlement(workspaceId: string, userId?: string) {
    if (env.selfhosted) return true;

    if (await this.hasWorkspaceTeamPlan(workspaceId)) {
      return true;
    }

    const ownerId = await this.getWorkspaceOwnerId(workspaceId);
    if (!ownerId) return false;

    if (await this.hasAiPlan(userId)) return true;
    return await this.hasAiPlan(ownerId);
  }

  async hasServerEntitlement(workspaceId: string) {
    if (env.selfhosted) return true;

    if (await this.hasWorkspaceTeamPlan(workspaceId)) {
      return true;
    }

    const ownerId = await this.getWorkspaceOwnerId(workspaceId);
    if (!ownerId) return false;
    return await this.hasAiPlan(ownerId);
  }

  async hasEntitlement(workspaceId: string, userId?: string) {
    const [serverEntitled, localEntitled] = await Promise.all([
      this.hasServerEntitlement(workspaceId),
      this.hasLocalEntitlement(workspaceId, userId),
    ]);

    return [serverEntitled, localEntitled] as const;
  }

  async assertServerEntitled(workspaceId: string) {
    if (!(await this.hasServerEntitlement(workspaceId))) {
      throw new ActionForbidden('BYOK requires Pro, Team, or Believer.');
    }
  }

  async assertLocalEntitled(workspaceId: string, userId?: string) {
    if (!(await this.hasLocalEntitlement(workspaceId, userId))) {
      throw new ActionForbidden('BYOK requires Pro, Team, or Believer.');
    }
  }

  private async hasWorkspaceTeamPlan(workspaceId: string) {
    try {
      const state =
        await this.quotaState.reconcileWorkspaceQuotaState(workspaceId);
      return ['team', 'selfhost_team'].includes(state.plan);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Workspace owner not found'
      ) {
        return false;
      }
      throw error;
    }
  }
}
