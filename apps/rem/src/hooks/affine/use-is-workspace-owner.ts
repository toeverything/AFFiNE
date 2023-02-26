import { PermissionType } from '@affine/datacenter';

import { AffineOfficialWorkspace } from '../../shared';

export function useIsWorkspaceOwner(workspace: AffineOfficialWorkspace) {
  if (workspace.flavour === 'local') return true;
  return workspace.permission_type === PermissionType.Owner;
}
