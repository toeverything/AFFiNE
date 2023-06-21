/* do not manipulate this file manually. */
export interface GraphQLQuery {
  id: string;
  operationName: string;
  definitionName: string;
  query: string;
  containsFile?: boolean;
}

export const createWorkspaceMutation = {
  id: 'createWorkspaceMutation' as const,
  operationName: 'createWorkspace',
  definitionName: 'createWorkspace',
  containsFile: false,
  query: `
mutation createWorkspace {
  createWorkspace {
    id
    public
    createdAt
  }
}`,
};

export const uploadAvatarMutation = {
  id: 'uploadAvatarMutation' as const,
  operationName: 'uploadAvatar',
  definitionName: 'uploadAvatar',
  containsFile: true,
  query: `
mutation uploadAvatar($id: String!, $avatar: Upload!) {
  uploadAvatar(id: $id, avatar: $avatar) {
    id
    name
    avatarUrl
    email
  }
}`,
};

export const workspaceByIdQuery = {
  id: 'workspaceByIdQuery' as const,
  operationName: 'workspaceById',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query workspaceById($id: String!) {
  workspace(id: $id) {
    id
    public
    createdAt
  }
}`,
};
