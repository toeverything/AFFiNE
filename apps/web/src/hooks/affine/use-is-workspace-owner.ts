import { PermissionType } from '@affine/workspace/affine/api';

import type { AffineOfficialWorkspace } from '../../shared';

export function useIsWorkspaceOwner(workspace: AffineOfficialWorkspace) {
  if (workspace.flavour === 'local') return true;
  return workspace.permission === PermissionType.Owner;
}
