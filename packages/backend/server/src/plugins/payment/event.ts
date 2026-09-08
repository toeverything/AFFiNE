import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Config, OnEvent } from '../../base';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { WorkspaceService } from '../../core/workspaces';
import { Models } from '../../models';

@Injectable()
export class PaymentEventHandlers {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly runtime: BackendRuntimeProvider,
    private readonly config: Config,
    private readonly models: Models
  ) {}

  @OnEvent('user.preDelete')
  async prepareSubscriptionCancellation({ id }: Events['user.preDelete']) {
    if (!this.config.payment.enabled || !this.config.payment.stripe?.apiKey) {
      return;
    }
    await this.runtime.executePaymentCommandV1({
      action: 'prepare_user_deletion',
      userId: id,
    });
  }

  @OnEvent('workspace.members.updated')
  async updateTeamSubscriptionQuantity({
    workspaceId,
  }: Events['workspace.members.updated']) {
    if (!this.config.payment.enabled || !this.config.payment.stripe?.apiKey) {
      return;
    }
    const quantity = await this.models.workspaceUser.chargedCount(workspaceId);
    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    await this.runtime.executePaymentCommandV1({
      action: 'update_quantity',
      actorUserId: owner.id,
      targetType: 'workspace',
      targetId: workspaceId,
      plan: 'team',
      quantity,
      intentId: randomUUID(),
    });
  }

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
}
