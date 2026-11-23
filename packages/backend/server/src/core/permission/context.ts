import type {
  PermissionDocRole,
  PermissionEvaluationOutputV1,
  PermissionWorkspaceRole,
} from '../../native';
import { DocRole, WorkspaceRole } from './types';

export type PermissionLegacyRoleBoundary = {
  effectiveRole: PermissionDocRole | PermissionWorkspaceRole | null;
  legacyApiRole: DocRole | WorkspaceRole | null;
};

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

export function toNativeDocRole(role: DocRole | null | undefined) {
  return role == null ? undefined : DOC_ROLE_TO_NATIVE.get(role);
}

export function toNativeExplicitDocGrantRole(role: DocRole | null | undefined) {
  if (role === DocRole.None || role === DocRole.External) {
    return undefined;
  }
  return toNativeDocRole(role);
}

export function workspaceLegacyBoundary(
  workspace: PermissionEvaluationOutputV1['workspace']
): PermissionLegacyRoleBoundary & {
  effectiveRole: PermissionWorkspaceRole | null;
} {
  const effectiveRole = workspace.effectiveRole ?? null;
  return {
    effectiveRole,
    legacyApiRole: effectiveRole
      ? (NATIVE_WORKSPACE_ROLE_TO_LEGACY.get(effectiveRole) ?? null)
      : null,
  };
}

export function docLegacyBoundary(
  doc: PermissionEvaluationOutputV1['docs'][number]
): PermissionLegacyRoleBoundary & { effectiveRole: PermissionDocRole | null } {
  const effectiveRole = doc.effectiveRole ?? null;
  return {
    effectiveRole,
    legacyApiRole: effectiveRole
      ? (NATIVE_DOC_ROLE_TO_LEGACY.get(effectiveRole) ?? null)
      : null,
  };
}
