import { assertExists } from '@blocksuite/store';

import { jotaiStore, workspacesAtom } from '../../atoms';
import { createAffineProviders } from '../../blocksuite';
import { Unreachable } from '../../components/affine/affine-error-eoundary';
import { AffineWorkspace, RemWorkspaceFlavour } from '../../shared';
import { apis } from '../../shared/apis';
import { createEmptyBlockSuiteWorkspace } from '../../utils';

type Query = (typeof QueryKey)[keyof typeof QueryKey];

export const fetcher = async (
  query:
    | Query
    | [Query, string, boolean]
    | [Query, string]
    | [Query, string, string]
) => {
  if (query === QueryKey.getUser) {
    return apis.auth.user ?? null;
  }
  if (Array.isArray(query)) {
    if (query[0] === QueryKey.downloadWorkspace) {
      if (typeof query[2] !== 'boolean') {
        throw new Unreachable();
      }
      return apis.downloadWorkspace(query[1], query[2]);
    } else if (query[0] === QueryKey.getMembers) {
      return apis.getWorkspaceMembers({
        id: query[1],
      });
    } else if (query[0] === QueryKey.getUserByEmail) {
      if (typeof query[2] !== 'string') {
        throw new Unreachable();
      }
      return apis.getUserByEmail({
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
      return apis.acceptInviting({
        invitingCode,
      });
    }
  } else {
    if (query === QueryKey.getWorkspaces) {
      return apis.getWorkspaces().then(workspaces => {
        return workspaces.map(workspace => {
          const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
            workspace.id,
            (k: string) =>
              // fixme: token could be expired
              ({ api: '/api/workspace', token: apis.auth.token }[k])
          );
          const remWorkspace: AffineWorkspace = {
            ...workspace,
            flavour: RemWorkspaceFlavour.AFFINE,
            blockSuiteWorkspace,
            providers: [...createAffineProviders(blockSuiteWorkspace)],
          };
          return remWorkspace;
        });
      });
    }
    return (apis as any)[query]();
  }
};

export const QueryKey = {
  acceptInvite: 'acceptInvite',
  getImage: 'getImage',
  getUser: 'getUser',
  getWorkspaces: 'getWorkspaces',
  downloadWorkspace: 'downloadWorkspace',
  getMembers: 'getMembers',
  getUserByEmail: 'getUserByEmail',
} as const;
