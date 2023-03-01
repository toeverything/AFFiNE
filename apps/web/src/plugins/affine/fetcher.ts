import { Unreachable } from '../../components/affine/affine-error-eoundary';
import {
  AffineRemoteUnSyncedWorkspace,
  RemWorkspaceFlavour,
  transformToAffineSyncedWorkspace,
} from '../../shared';
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
    }
  } else {
    if (query === QueryKey.getWorkspaces) {
      return apis.getWorkspaces().then(workspaces => {
        return workspaces.map(workspace => {
          const remWorkspace: AffineRemoteUnSyncedWorkspace = {
            ...workspace,
            flavour: RemWorkspaceFlavour.AFFINE,
            firstBinarySynced: false,
            blockSuiteWorkspace: createEmptyBlockSuiteWorkspace(
              workspace.id,
              (k: string) =>
                // fixme: token could be expired
                ({ api: '/api/workspace', token: apis.auth.token }[k])
            ),
            syncBinary: async () => {
              const binary = await apis.downloadWorkspace(
                workspace.id,
                workspace.public
              );
              if (remWorkspace.firstBinarySynced) {
                return null;
              }
              return transformToAffineSyncedWorkspace(remWorkspace, binary);
            },
          };
          return remWorkspace;
        });
      });
    }
    return (apis as any)[query]();
  }
};

export const QueryKey = {
  getUser: 'getUser',
  getWorkspaces: 'getWorkspaces',
  downloadWorkspace: 'downloadWorkspace',
  getMembers: 'getMembers',
  getUserByEmail: 'getUserByEmail',
} as const;
