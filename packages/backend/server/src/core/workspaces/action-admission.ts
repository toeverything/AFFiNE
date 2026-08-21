import { Injectable, Logger } from '@nestjs/common';

import { ActionForbidden, Config } from '../../base';
import { Models } from '../../models';
import { BackendRuntimeProvider } from '../backend-runtime';
import { QuotaStateService } from '../quota';

const PAID_USER_PLANS = new Set(['pro', 'lifetime_pro', 'ai']);
const PAID_WORKSPACE_PLANS = new Set(['pro', 'lifetime_pro', 'ai', 'team']);

type RestrictedWorkspaceAction =
  | 'inviteMember'
  | 'createInviteLink'
  | 'publishDoc';

@Injectable()
export class WorkspaceActionAdmissionService {
  private readonly logger = new Logger(WorkspaceActionAdmissionService.name);

  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly runtime: BackendRuntimeProvider,
    private readonly quotaState: QuotaStateService
  ) {}

  async assertAllowed(
    userId: string,
    context: {
      workspaceId: string;
      action: RestrictedWorkspaceAction;
      docId?: string;
    }
  ) {
    if (await this.runtime.isInviteAbuseUserQuarantinedOrBanned(userId)) {
      this.logger.warn('Action blocked for actor', { userId, ...context });
      throw new ActionForbidden(
        'This feature is temporarily unavailable for you.'
      );
    }
    if (
      await this.runtime.isInviteAbuseWorkspaceQuarantined(context.workspaceId)
    ) {
      this.logger.warn('Action blocked for workspace', { userId, ...context });
      throw new ActionForbidden(
        'This feature is temporarily unavailable for you.'
      );
    }

    const delaySeconds = this.config.auth.newAccountActionDelay;
    if (env.selfhosted || delaySeconds <= 0) return;

    const now = new Date();
    const user = await this.models.user.get(userId);
    const minAccountAgeMs = delaySeconds * 1000;
    if (user && now.getTime() - user.createdAt.getTime() >= minAccountAgeMs) {
      return;
    }

    const [userQuota, workspaceQuota] = await Promise.all([
      this.quotaState.reconcileUserQuotaState(userId),
      this.quotaState.reconcileWorkspaceQuotaState(context.workspaceId),
    ]);
    if (
      PAID_USER_PLANS.has(userQuota.plan) ||
      PAID_WORKSPACE_PLANS.has(workspaceQuota.plan)
    ) {
      return;
    }

    this.logger.warn('Action blocked for new account', {
      userId,
      createdAt: user?.createdAt,
      accountAgeMs: user ? now.getTime() - user.createdAt.getTime() : null,
      minAccountAgeMs,
      ...context,
    });
    throw new ActionForbidden(
      'This feature is temporarily unavailable for new accounts.'
    );
  }
}
