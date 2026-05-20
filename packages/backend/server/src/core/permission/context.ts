import { WorkspaceMemberStatus } from '@prisma/client';

import type {
  PermissionDocRole,
  PermissionEvaluationInputV1,
  PermissionEvaluationOutputV1,
  PermissionWorkspaceRole,
} from '../../native';
import { DocRole, WorkspaceRole } from './types';

export type PermissionRuntimeState = NonNullable<
  PermissionEvaluationInputV1['runtime']
>;

export type PermissionWorkspaceContext = NonNullable<
  PermissionEvaluationInputV1['workspace']
>;

export type PermissionDocContext = NonNullable<
  NonNullable<PermissionEvaluationInputV1['docs']>[number]
>;

export type PermissionLegacyRoleBoundary = {
  resourceOwnerRole: PermissionDocRole | PermissionWorkspaceRole | null;
  effectiveRole: PermissionDocRole | PermissionWorkspaceRole | null;
  legacyApiRole: DocRole | WorkspaceRole | null;
};

const WORKSPACE_ROLE_TO_NATIVE = new Map<
  WorkspaceRole,
  PermissionWorkspaceRole
>([
  [WorkspaceRole.External, 'external'],
  [WorkspaceRole.Collaborator, 'member'],
  [WorkspaceRole.Admin, 'admin'],
  [WorkspaceRole.Owner, 'owner'],
]);

const DOC_ROLE_TO_NATIVE = new Map<DocRole, PermissionDocRole>([
  [DocRole.None, 'none'],
  [DocRole.External, 'external'],
  [DocRole.Reader, 'reader'],
  [DocRole.Commenter, 'commenter'],
  [DocRole.Editor, 'editor'],
  [DocRole.Manager, 'manager'],
  [DocRole.Owner, 'owner'],
]);

const NATIVE_WORKSPACE_ROLE_TO_LEGACY = new Map<
  PermissionWorkspaceRole,
  WorkspaceRole
>([
  ['external', WorkspaceRole.External],
  ['member', WorkspaceRole.Collaborator],
  ['admin', WorkspaceRole.Admin],
  ['owner', WorkspaceRole.Owner],
]);

const NATIVE_DOC_ROLE_TO_LEGACY = new Map<PermissionDocRole, DocRole>([
  ['none', DocRole.None],
  ['external', DocRole.External],
  ['reader', DocRole.Reader],
  ['commenter', DocRole.Commenter],
  ['editor', DocRole.Editor],
  ['manager', DocRole.Manager],
  ['owner', DocRole.Owner],
]);

export function toNativeWorkspaceRole(role: WorkspaceRole | null | undefined) {
  return role == null ? undefined : WORKSPACE_ROLE_TO_NATIVE.get(role);
}

export function toNativeDocRole(role: DocRole | null | undefined) {
  return role == null ? undefined : DOC_ROLE_TO_NATIVE.get(role);
}

export function toNativeExplicitDocGrantRole(role: DocRole | null | undefined) {
  if (role === DocRole.None || role === DocRole.External) {
    return undefined;
  }
  return toNativeDocRole(role);
}

export function toNativeMemberState(status?: WorkspaceMemberStatus | null) {
  switch (status) {
    case WorkspaceMemberStatus.Accepted:
      return 'active';
    case WorkspaceMemberStatus.UnderReview:
      return 'waiting_review';
    case WorkspaceMemberStatus.AllocatingSeat:
    case WorkspaceMemberStatus.NeedMoreSeat:
    case WorkspaceMemberStatus.NeedMoreSeatAndReview:
      return 'waiting_seat';
    case WorkspaceMemberStatus.Pending:
      return 'pending';
    default:
      return undefined;
  }
}

export function workspaceLegacyBoundary(
  workspace: PermissionEvaluationOutputV1['workspace']
): PermissionLegacyRoleBoundary {
  const effectiveRole = workspace.effectiveRole ?? null;
  return {
    resourceOwnerRole: workspace.resourceOwnerRole ?? null,
    effectiveRole,
    legacyApiRole: effectiveRole
      ? (NATIVE_WORKSPACE_ROLE_TO_LEGACY.get(effectiveRole) ?? null)
      : null,
  };
}

export function docLegacyBoundary(
  doc: PermissionEvaluationOutputV1['docs'][number]
): PermissionLegacyRoleBoundary {
  const effectiveRole = doc.effectiveRole ?? null;
  return {
    resourceOwnerRole: doc.resourceOwnerRole ?? null,
    effectiveRole,
    legacyApiRole: effectiveRole
      ? (NATIVE_DOC_ROLE_TO_LEGACY.get(effectiveRole) ?? null)
      : null,
  };
}
