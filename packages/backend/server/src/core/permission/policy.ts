import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import {
  DocActionDenied,
  OnEvent,
  OwnerCanNotLeaveWorkspace,
  SpaceAccessDenied,
} from '../../base';
import { Models, WorkspaceRole } from '../../models';
import { QuotaService } from '../quota/service';
import { getAccessController } from './controller';
import type { Resource } from './resource';
import {
  type DocAction,
  type DocActionPermissions,
  mapWorkspaceRoleToPermissions,
  type WorkspaceAction,
  type WorkspaceActionPermissions,
} from './types';

export type WorkspaceReadonlyReason = 'member_overflow' | 'storage_overflow';
type WorkspaceQuotaSnapshot = Awaited<
  ReturnType<QuotaService['getWorkspaceQuotaWithUsage']>
> & {
  ownerQuota?: string;
};

export type WorkspaceState = {
  isTeamWorkspace: boolean;
  isReadonly: boolean;
  readonlyReasons: WorkspaceReadonlyReason[];
  canRecoverByRemovingMembers: boolean;
  canRecoverByDeletingBlobs: boolean;
  usesFallbackOwnerQuota: boolean;
};

const READONLY_WORKSPACE_ACTIONS: WorkspaceAction[] = [
  'Workspace.CreateDoc',
  'Workspace.Settings.Update',
  'Workspace.Properties.Create',
  'Workspace.Properties.Update',
  'Workspace.Properties.Delete',
  'Workspace.Blobs.Write',
];

const READONLY_DOC_ACTIONS: DocAction[] = [
  'Doc.Update',
  'Doc.Duplicate',
  'Doc.Publish',
  'Doc.Comments.Create',
  'Doc.Comments.Update',
  'Doc.Comments.Resolve',
];

const READONLY_WORKSPACE_FEATURE =
  'quota_exceeded_readonly_workspace_v1' as const;

type WorkspaceRoleChecker = {
  getRole(resource: Resource<'ws'>): Promise<WorkspaceRole | null>;
  docRoles(
    resource: Resource<'ws'>,
    docIds: string[]
  ): Promise<Array<{ role: unknown; permissions: Record<DocAction, boolean> }>>;
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
    private readonly quota: QuotaService
  ) {}

  async getWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
    const [isTeamWorkspace, isUnlimitedWorkspace, quota] = await Promise.all([
      this.models.workspace.isTeamWorkspace(workspaceId),
      this.models.workspaceFeature.has(workspaceId, 'unlimited_workspace'),
      this.quota.getWorkspaceQuotaWithUsage(workspaceId),
    ]);
    const quotaSnapshot = quota as WorkspaceQuotaSnapshot;

    const readonlyReasons: WorkspaceReadonlyReason[] = [];
    const usesFallbackOwnerQuota =
      !!quotaSnapshot.ownerQuota && !isUnlimitedWorkspace;

    if (usesFallbackOwnerQuota && quotaSnapshot.overcapacityMemberCount > 0) {
      readonlyReasons.push('member_overflow');
    }

    if (
      usesFallbackOwnerQuota &&
      quotaSnapshot.usedStorageQuota > quotaSnapshot.storageQuota
    ) {
      readonlyReasons.push('storage_overflow');
    }

    return {
      isTeamWorkspace,
      isReadonly: readonlyReasons.length > 0,
      readonlyReasons,
      canRecoverByRemovingMembers: readonlyReasons.includes('member_overflow'),
      canRecoverByDeletingBlobs: readonlyReasons.includes('storage_overflow'),
      usesFallbackOwnerQuota,
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
    const [state, isReadonlyFeatureEnabled] = await Promise.all([
      this.getWorkspaceState(workspaceId),
      this.models.workspaceFeature.has(workspaceId, READONLY_WORKSPACE_FEATURE),
    ]);

    if (state.isReadonly && !isReadonlyFeatureEnabled) {
      await this.models.workspaceFeature.add(
        workspaceId,
        READONLY_WORKSPACE_FEATURE,
        `workspace recovery mode: ${state.readonlyReasons.join(',')}`
      );
    } else if (!state.isReadonly && isReadonlyFeatureEnabled) {
      await this.models.workspaceFeature.remove(
        workspaceId,
        READONLY_WORKSPACE_FEATURE
      );
    }

    return state;
  }

  async isWorkspaceReadonly(workspaceId: string) {
    const hasReadonlyFeature = await this.models.workspaceFeature.has(
      workspaceId,
      READONLY_WORKSPACE_FEATURE
    );

    if (!hasReadonlyFeature) {
      return false;
    }

    const state = await this.getWorkspaceState(workspaceId);
    if (!state.isReadonly) {
      await this.models.workspaceFeature.remove(
        workspaceId,
        READONLY_WORKSPACE_FEATURE
      );
      return false;
    }

    return true;
  }

  async isSharingEnabled(workspaceId: string) {
    return await this.models.workspace.allowSharing(workspaceId);
  }

  async canReadWorkspaceByPublicFlag(workspaceId: string) {
    const workspace = await this.models.workspace.get(workspaceId);
    return !!workspace?.public && (workspace.enableSharing ?? true);
  }

  async canReadWorkspaceBySharedDocs(workspaceId: string) {
    const [sharingEnabled, hasPublicDocs] = await Promise.all([
      this.isSharingEnabled(workspaceId),
      this.models.doc.hasPublic(workspaceId),
    ]);

    return sharingEnabled && hasPublicDocs;
  }

  async canReadSharedDoc(workspaceId: string, docId: string) {
    const [sharingEnabled, isPublicDoc] = await Promise.all([
      this.isSharingEnabled(workspaceId),
      this.models.doc.isPublic(workspaceId, docId),
    ]);

    return sharingEnabled && isPublicDoc;
  }

  async canPreviewDoc(workspaceId: string, docId: string) {
    const [sharingEnabled, canReadSharedDoc, allowUrlPreview] =
      await Promise.all([
        this.isSharingEnabled(workspaceId),
        this.canReadSharedDoc(workspaceId, docId),
        this.models.workspace.allowUrlPreview(workspaceId),
      ]);

    return sharingEnabled && (canReadSharedDoc || allowUrlPreview);
  }

  async canPreviewWorkspace(workspaceId: string) {
    const [sharingEnabled, allowUrlPreview] = await Promise.all([
      this.isSharingEnabled(workspaceId),
      this.models.workspace.allowUrlPreview(workspaceId),
    ]);

    return sharingEnabled && allowUrlPreview;
  }

  async canPublishDoc(workspaceId: string) {
    return await this.isSharingEnabled(workspaceId);
  }

  async applyWorkspacePermissions(
    workspaceId: string,
    permissions: WorkspaceActionPermissions
  ) {
    if (!(await this.isWorkspaceReadonly(workspaceId))) {
      return permissions;
    }

    const next = { ...permissions };
    READONLY_WORKSPACE_ACTIONS.forEach(action => {
      next[action] = false;
    });
    return next;
  }

  async applyDocPermissions(
    workspaceId: string,
    permissions: DocActionPermissions
  ) {
    if (!(await this.isWorkspaceReadonly(workspaceId))) {
      return permissions;
    }

    const next = { ...permissions };
    READONLY_DOC_ACTIONS.forEach(action => {
      next[action] = false;
    });
    return next;
  }

  async assertWorkspaceActionAllowed(
    workspaceId: string,
    action: WorkspaceAction
  ) {
    if (
      READONLY_WORKSPACE_ACTIONS.includes(action) &&
      (await this.isWorkspaceReadonly(workspaceId))
    ) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }
  }

  async assertDocActionAllowed(
    workspaceId: string,
    docId: string,
    action: DocAction
  ) {
    if (
      READONLY_DOC_ACTIONS.includes(action) &&
      (await this.isWorkspaceReadonly(workspaceId))
    ) {
      throw new DocActionDenied({
        action,
        docId,
        spaceId: workspaceId,
      });
    }
  }

  async assertWorkspaceRoleAction(
    userId: string,
    workspaceId: string,
    action: WorkspaceAction
  ) {
    const checker = getAccessController(
      'ws'
    ) as unknown as WorkspaceRoleChecker;
    const role = await checker.getRole({ userId, workspaceId });
    const permissions = mapWorkspaceRoleToPermissions(role);

    if (!permissions[action]) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }
  }

  async assertDocRoleAction(
    userId: string,
    workspaceId: string,
    docId: string,
    action: DocAction
  ) {
    const checker = getAccessController(
      'ws'
    ) as unknown as WorkspaceRoleChecker;
    const [role] = await checker.docRoles({ userId, workspaceId }, [docId]);

    if (!role?.permissions[action]) {
      throw new DocActionDenied({
        action,
        docId,
        spaceId: workspaceId,
      });
    }
  }

  async assertCanUploadBlob(userId: string, workspaceId: string) {
    await this.assertWorkspaceRoleAction(
      userId,
      workspaceId,
      'Workspace.Blobs.Write'
    );
    await this.assertWorkspaceActionAllowed(
      workspaceId,
      'Workspace.Blobs.Write'
    );
  }

  async assertCanDeleteBlob(userId: string, workspaceId: string) {
    await this.assertWorkspaceRoleAction(
      userId,
      workspaceId,
      'Workspace.Blobs.Write'
    );
  }

  async assertCanInviteMembers(workspaceId: string) {
    if (await this.isWorkspaceReadonly(workspaceId)) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }
  }

  async assertCanRevokeMember(
    userId: string,
    workspaceId: string,
    role: WorkspaceRole
  ) {
    await this.assertWorkspaceRoleAction(
      userId,
      workspaceId,
      role === WorkspaceRole.Admin
        ? 'Workspace.Administrators.Manage'
        : 'Workspace.Users.Manage'
    );
  }

  @Transactional()
  async handleTeamPlanCanceled(workspaceId: string) {
    await this.models.workspaceUser.deleteNonAccepted(workspaceId);
    await this.models.workspaceUser.demoteAcceptedAdmins(workspaceId);
    await this.models.workspaceFeature.remove(workspaceId, 'team_plan_v1');
    return await this.reconcileWorkspaceQuotaState(workspaceId);
  }

  async assertCanUnpublishDoc(
    userId: string,
    workspaceId: string,
    docId: string
  ) {
    await this.assertDocRoleAction(userId, workspaceId, docId, 'Doc.Publish');
  }

  async assertCanPublishDoc(
    userId: string,
    workspaceId: string,
    docId: string
  ) {
    await this.assertDocRoleAction(userId, workspaceId, docId, 'Doc.Publish');
    await this.assertDocActionAllowed(workspaceId, docId, 'Doc.Publish');

    if (!(await this.canPublishDoc(workspaceId))) {
      throw new DocActionDenied({
        action: 'Doc.Publish',
        docId,
        spaceId: workspaceId,
      });
    }
  }

  async assertCanManageInviteLink(userId: string, workspaceId: string) {
    await this.assertWorkspaceRoleAction(
      userId,
      workspaceId,
      'Workspace.Users.Manage'
    );
  }

  async assertCanLeaveWorkspace(userId: string, workspaceId: string) {
    const role = await this.models.workspaceUser.getActive(workspaceId, userId);

    if (!role) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }

    if (role.type === WorkspaceRole.Owner) {
      throw new OwnerCanNotLeaveWorkspace();
    }
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
