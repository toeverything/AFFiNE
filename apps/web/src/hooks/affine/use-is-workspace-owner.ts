import { WorkspaceFlavour } from '@affine/env/workspace';
import { PermissionType } from '@affine/env/workspace/legacy-cloud';

import type { AffineOfficialWorkspace } from '../../shared';

export function useIsWorkspaceOwner(workspace: AffineOfficialWorkspace) {
  if (workspace.flavour === WorkspaceFlavour.LOCAL) return true;
  if (workspace.flavour === WorkspaceFlavour.PUBLIC) return false;
  return workspace.permission === PermissionType.Owner;
}
