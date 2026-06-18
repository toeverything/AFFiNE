import { Injectable } from '@nestjs/common';

import { EventBus, OnEvent } from '../../base';
import { WorkspacePolicyService } from '../../core/permission';
import { QuotaStateService } from '../../core/quota/state';
import { WorkspaceService } from '../../core/workspaces';
import { SubscriptionPlan } from './types';

@Injectable()
export class PaymentEventHandlers {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly policy: WorkspacePolicyService,
    private readonly quotaState: QuotaStateService,
    private readonly event: EventBus
  ) {}

  @OnEvent('workspace.subscription.activated')
  async onWorkspaceSubscriptionUpdated({
    workspaceId,
    plan,
  }: Events['workspace.subscription.activated']) {
    switch (plan) {
      case 'team': {
        const isTeam = await this.workspace.isTeamWorkspace(workspaceId);
        if (!isTeam) {
          // this event will triggered when subscription is activated or changed
          // we only send emails when the team workspace is activated
          await this.workspace.sendTeamWorkspaceUpgradedEmail(workspaceId);
        }
        break;
      }
      default:
        break;
    }
  }

  @OnEvent('workspace.subscription.canceled')
  async onWorkspaceSubscriptionCanceled({
    workspaceId,
    plan,
  }: Events['workspace.subscription.canceled']) {
    switch (plan) {
      case SubscriptionPlan.Team:
        await this.policy.handleTeamPlanCanceled(workspaceId);
        break;
      default:
        break;
    }
  }

  @OnEvent('user.subscription.activated')
  async onUserSubscriptionUpdated({
    userId,
    plan,
  }: Events['user.subscription.activated']) {
    switch (plan) {
      case SubscriptionPlan.AI:
      case SubscriptionPlan.Pro:
        await this.policy.reconcileOwnedWorkspaces(userId);
        break;
      default:
        break;
    }
  }

  @OnEvent('user.subscription.canceled')
  async onUserSubscriptionCanceled({
    userId,
    plan,
  }: Events['user.subscription.canceled']) {
    switch (plan) {
      case SubscriptionPlan.AI:
      case SubscriptionPlan.Pro: {
        await this.policy.reconcileOwnedWorkspaces(userId);
        break;
      }
      default:
        break;
    }
  }

  @OnEvent('entitlement.changed')
  async onEntitlementChanged({
    targetType,
    targetId,
  }: Events['entitlement.changed']) {
    if (targetType !== 'workspace') {
      return;
    }

    const state = await this.quotaState.reconcileWorkspaceQuotaState(targetId);
    if (state.plan !== 'team' && state.plan !== 'selfhost_team') {
      return;
    }

    this.event.emit('workspace.members.allocateSeats', {
      workspaceId: targetId,
      quantity: state.seatLimit ?? 0,
    });
  }
}
