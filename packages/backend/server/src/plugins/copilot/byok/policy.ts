import { Injectable } from '@nestjs/common';

import { ActionForbidden } from '../../../base';
import { Models, WorkspaceRole } from '../../../models';

@Injectable()
export class ByokEntitlementPolicy {
  constructor(private readonly models: Models) {}

  private isUserPlanEntitled(features: string[]) {
    return (
      features.includes('pro_plan_v1') ||
      features.includes('lifetime_pro_plan_v1') ||
      features.includes('unlimited_copilot')
    );
  }

  async hasAiPlan(userId?: string) {
    if (!userId) return false;
    const features = await this.models.userFeature.list(userId);
    return this.isUserPlanEntitled(features);
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

    if (await this.models.workspaceFeature.has(workspaceId, 'team_plan_v1')) {
      return true;
    }

    const ownerId = await this.getWorkspaceOwnerId(workspaceId);
    if (!ownerId) return false;

    if (await this.hasAiPlan(userId)) return true;
    return await this.hasAiPlan(ownerId);
  }

  async hasServerEntitlement(workspaceId: string) {
    if (env.selfhosted) return true;

    if (await this.models.workspaceFeature.has(workspaceId, 'team_plan_v1')) {
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
}
