import { PermissionType } from '@affine/workspace/affine/api';
import { WorkspaceFlavour } from '@affine/workspace/type';

import type { AffineOfficialWorkspace } from '../../shared';

export function useIsWorkspaceOwner(workspace: AffineOfficialWorkspace) {
  if (workspace.flavour === WorkspaceFlavour.LOCAL) return true;
  if (workspace.flavour === WorkspaceFlavour.PUBLIC) return false;
  return workspace.permission === PermissionType.Owner;
}
