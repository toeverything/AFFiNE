import { Injectable } from '@nestjs/common';

import { ActionForbidden, SpaceOwnerNotFound } from '../../../base';
import { BackendRuntimeProvider } from '../../../core/backend-runtime';

@Injectable()
export class ByokEntitlementPolicy {
  constructor(private readonly runtime: BackendRuntimeProvider) {}

  async hasAiPlan(userId?: string) {
    return userId ? this.runtime.hasAiEntitlementV1(userId) : false;
  }

  async hasLocalEntitlement(workspaceId: string, userId?: string) {
    return (await this.read(workspaceId, userId)).local;
  }

  async hasServerEntitlement(workspaceId: string) {
    return (await this.read(workspaceId)).server;
  }

  async hasEntitlement(workspaceId: string, userId?: string) {
    const result = await this.read(workspaceId, userId);
    return [result.server, result.local] as const;
  }

  async assertServerEntitled(workspaceId: string) {
    if (!(await this.hasServerEntitlement(workspaceId))) {
      throw new ActionForbidden(
        'BYOK requires a Pro, Team, Believer, or AI entitlement.'
      );
    }
  }

  async assertLocalEntitled(workspaceId: string, userId?: string) {
    if (!(await this.hasLocalEntitlement(workspaceId, userId))) {
      throw new ActionForbidden(
        'BYOK requires a Pro, Team, Believer, or AI entitlement.'
      );
    }
  }

  async assertEntitled(workspaceId: string, userId?: string) {
    const [serverEntitled, localEntitled] = await this.hasEntitlement(
      workspaceId,
      userId
    );
    if (!serverEntitled && !localEntitled) {
      throw new ActionForbidden(
        'BYOK requires a Pro, Team, Believer, or AI entitlement.'
      );
    }
  }

  private async read(workspaceId: string, userId?: string) {
    try {
      return await this.runtime.getByokEntitlementV1(workspaceId, userId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'workspace_owner_not_found'
      ) {
        throw new SpaceOwnerNotFound({ spaceId: workspaceId });
      }
      throw error;
    }
  }
}
