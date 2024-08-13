import { Injectable, Logger } from '@nestjs/common';

import { Config, type EventPayload, OnEvent } from '../../fundamentals';
import { UserService } from '../user/service';
import { FeatureService } from './service';
import { FeatureType } from './types';

const STAFF = ['@toeverything.info', '@affine.pro'];

export enum EarlyAccessType {
  App = 'app',
  AI = 'ai',
}

@Injectable()
export class FeatureManagementService {
  protected logger = new Logger(FeatureManagementService.name);

  constructor(
    private readonly feature: FeatureService,
    private readonly user: UserService,
    private readonly config: Config
  ) {}

  // ======== Admin ========

  isStaff(email: string) {
    for (const domain of STAFF) {
      if (email.endsWith(domain)) {
        return true;
      }
    }

    return false;
  }

  isAdmin(userId: string) {
    return this.feature.hasUserFeature(userId, FeatureType.Admin);
  }

  addAdmin(userId: string) {
    return this.feature.addUserFeature(userId, FeatureType.Admin, 'Admin user');
  }

  removeAdmin(userId: string) {
    return this.feature.removeUserFeature(userId, FeatureType.Admin);
  }

  // ======== Early Access ========
  async addEarlyAccess(
    userId: string,
    type: EarlyAccessType = EarlyAccessType.App
  ) {
    return this.feature.addUserFeature(
      userId,
      type === EarlyAccessType.App
        ? FeatureType.EarlyAccess
        : FeatureType.AIEarlyAccess,
      'Early access user'
    );
  }

  async removeEarlyAccess(
    userId: string,
    type: EarlyAccessType = EarlyAccessType.App
  ) {
    return this.feature.removeUserFeature(
      userId,
      type === EarlyAccessType.App
        ? FeatureType.EarlyAccess
        : FeatureType.AIEarlyAccess
    );
  }

  async listEarlyAccess(type: EarlyAccessType = EarlyAccessType.App) {
    return this.feature.listFeatureUsers(
      type === EarlyAccessType.App
        ? FeatureType.EarlyAccess
        : FeatureType.AIEarlyAccess
    );
  }

  async isEarlyAccessUser(
    userId: string,
    type: EarlyAccessType = EarlyAccessType.App
  ) {
    return await this.feature
      .hasUserFeature(
        userId,
        type === EarlyAccessType.App
          ? FeatureType.EarlyAccess
          : FeatureType.AIEarlyAccess
      )
      .catch(() => false);
  }

  /// check early access by email
  async canEarlyAccess(
    email: string,
    type: EarlyAccessType = EarlyAccessType.App
  ) {
    const earlyAccessControlEnabled = await this.config.runtime.fetch(
      'flags/earlyAccessControl'
    );

    if (earlyAccessControlEnabled && !this.isStaff(email)) {
      const user = await this.user.findUserByEmail(email);
      if (!user) {
        return false;
      }
      return this.isEarlyAccessUser(user.id, type);
    } else {
      return true;
    }
  }

  // ======== CopilotFeature ========
  async addCopilot(userId: string, reason = 'Copilot plan user') {
    return this.feature.addUserFeature(
      userId,
      FeatureType.UnlimitedCopilot,
      reason
    );
  }

  async removeCopilot(userId: string) {
    return this.feature.removeUserFeature(userId, FeatureType.UnlimitedCopilot);
  }

  async isCopilotUser(userId: string) {
    return await this.feature.hasUserFeature(
      userId,
      FeatureType.UnlimitedCopilot
    );
  }

  // ======== User Feature ========
  async getActivatedUserFeatures(userId: string): Promise<FeatureType[]> {
    const features = await this.feature.getActivatedUserFeatures(userId);
    return features.map(f => f.feature.name);
  }

  // ======== Workspace Feature ========
  async addWorkspaceFeatures(
    workspaceId: string,
    feature: FeatureType,
    reason?: string
  ) {
    return this.feature.addWorkspaceFeature(
      workspaceId,
      feature,
      reason || 'add feature by api'
    );
  }

  async getWorkspaceFeatures(workspaceId: string) {
    const features = await this.feature.getWorkspaceFeatures(workspaceId);
    return features.filter(f => f.activated).map(f => f.feature.name);
  }

  async hasWorkspaceFeature(workspaceId: string, feature: FeatureType) {
    return this.feature.hasWorkspaceFeature(workspaceId, feature);
  }

  async removeWorkspaceFeature(workspaceId: string, feature: FeatureType) {
    return this.feature
      .removeWorkspaceFeature(workspaceId, feature)
      .then(c => c > 0);
  }

  async listFeatureWorkspaces(feature: FeatureType) {
    return this.feature.listFeatureWorkspaces(feature);
  }

  @OnEvent('user.admin.created')
  async onAdminUserCreated({ id }: EventPayload<'user.admin.created'>) {
    await this.addAdmin(id);
  }
}
