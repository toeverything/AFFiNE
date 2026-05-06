import { Injectable } from '@nestjs/common';

import { CopilotQuotaExceeded } from '../../../base';
import { ByokService } from '../byok/service';
import type { ByokFeatureKind } from '../byok/types';
import type { CopilotProviderProfile } from '../config';
import { ConversationPolicy } from '../conversation/policy';
import {
  getByokSourceCoverage,
  getCopilotFeatureAccess,
} from './feature-coverage';

export type CopilotAccessContext = {
  userId?: string;
  workspaceId?: string;
  byokLeaseId?: string;
  featureKind?: ByokFeatureKind;
  quotaBackedRoutesAllowed?: boolean;
};

export type CopilotRouteAccess = {
  byokProfiles: CopilotProviderProfile[];
  quotaBackedRoutesAvailable: boolean;
};

export type CopilotTurnRouteAccess = {
  byokProfiles: CopilotProviderProfile[];
  quotaBackedRoutesAllowed?: boolean;
};

@Injectable()
export class CopilotAccessPolicy {
  constructor(
    private readonly conversationPolicy: ConversationPolicy,
    private readonly byok: ByokService
  ) {}

  async getByokProfiles(context: CopilotAccessContext = {}) {
    const coverage = getByokSourceCoverage(context.featureKind);
    return await this.byok.getProfiles(context, coverage);
  }

  async canUseQuotaBackedRoutes(context: CopilotAccessContext = {}) {
    if (context.quotaBackedRoutesAllowed !== undefined) {
      return context.quotaBackedRoutesAllowed;
    }
    if (!getCopilotFeatureAccess(context.featureKind).quotaMetered) {
      return true;
    }
    if (!context.userId) {
      return true;
    }
    return await this.conversationPolicy.hasQuota(context.userId);
  }

  async getQuota(userId: string) {
    return await this.conversationPolicy.getQuota(userId);
  }

  async checkQuota(userId: string) {
    await this.conversationPolicy.checkQuota(userId);
  }

  async resolveRouteAccess(
    context: CopilotAccessContext = {}
  ): Promise<CopilotRouteAccess> {
    const [byokProfiles, quotaBackedRoutesAvailable] = await Promise.all([
      this.getByokProfiles(context),
      this.canUseQuotaBackedRoutes(context),
    ]);

    return { byokProfiles, quotaBackedRoutesAvailable };
  }

  async resolveTurnRouteAccess(
    context: CopilotAccessContext
  ): Promise<CopilotTurnRouteAccess> {
    const byokProfiles = await this.getByokProfiles(context);
    if (context.quotaBackedRoutesAllowed === false) {
      return { byokProfiles, quotaBackedRoutesAllowed: false };
    }
    const featureAccess = getCopilotFeatureAccess(context.featureKind);
    if (!byokProfiles.length && context.userId && featureAccess.quotaMetered) {
      await this.conversationPolicy.checkQuota(context.userId);
    }

    const quotaBackedRoutesAllowed = byokProfiles.length
      ? context.quotaBackedRoutesAllowed
      : true;
    return { byokProfiles, quotaBackedRoutesAllowed };
  }

  async assertQuotaOrByok(context: CopilotAccessContext) {
    const byokProfiles = await this.getByokProfiles(context);
    if (context.quotaBackedRoutesAllowed === false) {
      if (!byokProfiles.length) {
        throw new CopilotQuotaExceeded();
      }
      return;
    }
    const featureAccess = getCopilotFeatureAccess(context.featureKind);
    if (!byokProfiles.length && context.userId && featureAccess.quotaMetered) {
      await this.conversationPolicy.checkQuota(context.userId);
    }
  }
}
