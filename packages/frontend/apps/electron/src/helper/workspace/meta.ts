import path from 'node:path';

import { type SpaceType } from '@affine/nbstore';

import { normalizeWorkspaceIdForPath } from '../../shared/utils';
import { mainRPC } from '../main-rpc';
import type { WorkspaceMeta } from '../type';

let _appDataPath = '';

export async function getAppDataPath() {
  if (_appDataPath) {
    return _appDataPath;
  }
  _appDataPath = await mainRPC.getPath('sessionData');
  return _appDataPath;
}

export async function getWorkspacesBasePath() {
  return path.join(await getAppDataPath(), 'workspaces');
}

export async function getWorkspaceBasePathV1(
  spaceType: SpaceType,
  workspaceId: string
) {
  const safeWorkspaceId = normalizeWorkspaceIdForPath(workspaceId);
  return path.join(
    await getAppDataPath(),
    spaceType === 'userspace' ? 'userspaces' : 'workspaces',
    safeWorkspaceId
  );
}

export async function getSpaceBasePath(spaceType: SpaceType) {
  return path.join(
    await getAppDataPath(),
    spaceType === 'userspace' ? 'userspaces' : 'workspaces'
  );
}

export function escapeFilename(name: string) {
  // replace all special characters with '_' and replace repeated '_' with a single '_' and remove trailing '_'
  return name
    .replaceAll(/[\\/!@#$%^&*()+~`"':;,?<>|]/g, '_')
    .split('_')
    .filter(Boolean)
    .join('_');
}

export async function getSpaceDBPath(
  peer: string,
  spaceType: SpaceType,
  id: string
) {
  const safeId = normalizeWorkspaceIdForPath(id);
  return path.join(
    await getSpaceBasePath(spaceType),
    escapeFilename(peer),
    safeId,
    'storage.db'
  );
}

export async function getDeletedWorkspacesBasePath() {
  return path.join(await getAppDataPath(), 'deleted-workspaces');
}

export async function getWorkspaceDBPath(
  spaceType: SpaceType,
  workspaceId: string
) {
  return path.join(
    await getWorkspaceBasePathV1(spaceType, workspaceId),
    'storage.db'
  );
}

export async function getWorkspaceMetaPath(
  spaceType: SpaceType,
  workspaceId: string
) {
  return path.join(
    await getWorkspaceBasePathV1(spaceType, workspaceId),
    'meta.json'
  );
}

/**
 * Get workspace meta, create one if not exists
 * This function will also migrate the workspace if needed
 */
export async function getWorkspaceMeta(
  spaceType: SpaceType,
  workspaceId: string
): Promise<WorkspaceMeta> {
  const dbPath = await getWorkspaceDBPath(spaceType, workspaceId);

  return {
    mainDBPath: dbPath,
    id: workspaceId,
  };
}
