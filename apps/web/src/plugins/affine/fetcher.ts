import { getLoginStorage } from '@affine/workspace/affine/login';
import { jotaiStore } from '@affine/workspace/atom';
import type { AffineWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { assertExists } from '@blocksuite/store';

import { workspacesAtom } from '../../atoms';
import { createAffineProviders } from '../../blocksuite';
import { Unreachable } from '../../components/affine/affine-error-eoundary';
import { affineApis } from '../../shared/apis';

type Query = (typeof QueryKey)[keyof typeof QueryKey];

export const fetcher = async (
  query:
    | Query
    | [Query, string, boolean]
    | [Query, string]
    | [Query, string, string]
) => {
  if (Array.isArray(query)) {
    if (query[0] === QueryKey.downloadWorkspace) {
      if (typeof query[2] !== 'boolean') {
        throw new Unreachable();
      }
      return affineApis.downloadWorkspace(query[1], query[2]);
    } else if (query[0] === QueryKey.getMembers) {
      return affineApis.getWorkspaceMembers({
        id: query[1],
      });
    } else if (query[0] === QueryKey.getUserByEmail) {
      if (typeof query[2] !== 'string') {
        throw new Unreachable();
      }
      return affineApis.getUserByEmail({
        workspace_id: query[1],
        email: query[2],
      });
    } else if (query[0] === QueryKey.getImage) {
      const workspaceId = query[1];
      const key = query[2];
      if (typeof key !== 'string') {
        throw new TypeError('key must be a string');
      }
      const workspaces = await jotaiStore.get(workspacesAtom);
      const workspace = workspaces.find(({ id }) => id === workspaceId);
      assertExists(workspace);
      const storage = await workspace.blockSuiteWorkspace.blobs;
      if (!storage) {
        return null;
      }
      return storage.get(key);
    } else if (query[0] === QueryKey.acceptInvite) {
      const invitingCode = query[1];
      if (typeof invitingCode !== 'string') {
        throw new TypeError('invitingCode must be a string');
      }
      return affineApis.acceptInviting({
        invitingCode,
      });
    }
  } else {
    if (query === QueryKey.getWorkspaces) {
      return affineApis.getWorkspaces().then(workspaces => {
        return workspaces.map(workspace => {
          const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
            workspace.id,
            (k: string) =>
              // fixme: token could be expired
              ({ api: '/api/workspace', token: getLoginStorage()?.token }[k])
          );
          const remWorkspace: AffineWorkspace = {
            ...workspace,
            flavour: WorkspaceFlavour.AFFINE,
            blockSuiteWorkspace,
            providers: [...createAffineProviders(blockSuiteWorkspace)],
          };
          return remWorkspace;
        });
      });
    }
    return (affineApis as any)[query]();
  }
};

export const QueryKey = {
  acceptInvite: 'acceptInvite',
  getImage: 'getImage',
  getWorkspaces: 'getWorkspaces',
  downloadWorkspace: 'downloadWorkspace',
  getMembers: 'getMembers',
  getUserByEmail: 'getUserByEmail',
} as const;
