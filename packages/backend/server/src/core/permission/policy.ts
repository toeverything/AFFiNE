import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import { OnEvent } from '../../base';
import { Models, WorkspaceRole } from '../../models';
import { QuotaStateService } from '../quota/state';

export type WorkspaceReadonlyReason = 'member_overflow' | 'storage_overflow';
type WorkspaceQuotaSnapshot = Awaited<
  ReturnType<QuotaStateService['reconcileWorkspaceQuotaState']>
> & {
  readonlyReasons: WorkspaceReadonlyReason[];
};

export type WorkspaceState = {
  isTeamWorkspace: boolean;
  isReadonly: boolean;
  readonlyReasons: WorkspaceReadonlyReason[];
  canRecoverByRemovingMembers: boolean;
  canRecoverByDeletingBlobs: boolean;
  usesFallbackOwnerQuota: boolean;
};

declare global {
  interface Events {
    'workspace.blobs.updated': {
      workspaceId: string;
    };
  }
}

@Injectable()
export class WorkspacePolicyService {
  constructor(
    private readonly models: Models,
    private readonly quotaState: QuotaStateService
  ) {}

  async getWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
    const current = await this.quotaState.getWorkspaceQuotaState(workspaceId);
    const quota =
      current?.known &&
      !current.stale &&
      (!current.staleAfter || current.staleAfter > new Date())
        ? current
        : await this.quotaState.reconcileWorkspaceQuotaState(workspaceId);
    return this.toWorkspaceState(quota);
  }

  private toWorkspaceState(
    quota: Awaited<
      ReturnType<QuotaStateService['reconcileWorkspaceQuotaState']>
    >
  ): WorkspaceState {
    const quotaSnapshot = quota as WorkspaceQuotaSnapshot;

    const readonlyReasons = quotaSnapshot.readonlyReasons;

    return {
      isTeamWorkspace: ['team', 'selfhost_team'].includes(quotaSnapshot.plan),
      isReadonly: readonlyReasons.length > 0,
      readonlyReasons,
      canRecoverByRemovingMembers: readonlyReasons.includes('member_overflow'),
      canRecoverByDeletingBlobs: readonlyReasons.includes('storage_overflow'),
      usesFallbackOwnerQuota: quotaSnapshot.usesOwnerQuota,
    };
  }

  async reconcileOwnedWorkspaces(userId: string) {
    const workspaces = await this.models.workspaceUser.getUserActiveRoles(
      userId,
      { role: WorkspaceRole.Owner }
    );

    await Promise.all(
      workspaces.map(({ workspaceId }) =>
        this.reconcileWorkspaceQuotaState(workspaceId)
      )
    );
  }

  async reconcileWorkspaceQuotaState(workspaceId: string) {
    return this.toWorkspaceState(
      await this.quotaState.reconcileWorkspaceQuotaState(workspaceId)
    );
  }

  async handleTeamPlanCanceled(workspaceId: string) {
    await this.cleanupTeamPlanCanceled(workspaceId);
    return await this.reconcileWorkspaceQuotaState(workspaceId);
  }

  @Transactional()
  private async cleanupTeamPlanCanceled(workspaceId: string) {
    await this.models.workspaceUser.deleteNonAccepted(workspaceId);
    await this.models.workspaceUser.demoteAcceptedAdmins(workspaceId);
  }

  @OnEvent('workspace.members.updated')
  async onWorkspaceMembersUpdated({
    workspaceId,
  }: Events['workspace.members.updated']) {
    await this.reconcileWorkspaceQuotaState(workspaceId);
  }

  @OnEvent('workspace.owner.changed')
  async onWorkspaceOwnerChanged({
    workspaceId,
  }: Events['workspace.owner.changed']) {
    await this.reconcileWorkspaceQuotaState(workspaceId);
  }

  @OnEvent('workspace.blobs.updated')
  async onWorkspaceBlobsUpdated({
    workspaceId,
  }: Events['workspace.blobs.updated']) {
    await this.reconcileWorkspaceQuotaState(workspaceId);
  }
}
