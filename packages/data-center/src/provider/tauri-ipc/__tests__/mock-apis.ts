import { PutBlob, GetBlob } from '../ipc/types/blob';
import {
  YDocumentUpdate,
  GetDocumentParameter,
  GetDocumentResponse,
} from '../ipc/types/document';
import { CreateUser, User } from '../ipc/types/user';
import {
  CreateWorkspace,
  CreateWorkspaceResult,
  GetWorkspaces,
  GetWorkspacesResult,
  GetWorkspace,
  GetWorkspaceResult,
} from '../ipc/types/workspace';

export const updateYDocument = async (parameters: YDocumentUpdate) =>
  await true;

export const getYDocument = async (
  parameters: GetDocumentParameter
): Promise<GetDocumentResponse> =>
  await {
    updates: [],
  };

export const createWorkspace = async (
  parameters: CreateWorkspace
): Promise<CreateWorkspaceResult> => await { id: 'xxx', name: 'xxx' };

export const getWorkspaces = async (
  parameters: GetWorkspaces
): Promise<GetWorkspacesResult> =>
  await {
    workspaces: [],
  };

export const getWorkspace = async (
  parameters: GetWorkspace
): Promise<GetWorkspaceResult> =>
  await {
    workspace: {
      created_at: 0,
      id: '',
      member_count: 1,
      public: true,
      type: 0,
    },
  };

export const putBlob = async (parameters: PutBlob): Promise<string> =>
  await 'path/xxx';

export const getBlob = async (parameters: GetBlob): Promise<number[]> =>
  await [];

/**
 * This will create a private workspace too.
 * @returns
 */
export const createUser = async (parameters: CreateUser): Promise<User> =>
  await {
    created_at: 0,
    id: 1,
    email: 'xxx@xxx.xxx',
    name: 'xxx',
  };
