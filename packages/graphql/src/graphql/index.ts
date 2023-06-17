/* do not manipulate this file manually. */
export interface GraphQLQuery {
  id: string;
  operationName: string;
  definitionName: string;
  query: string;
}

export const createWorkspaceMutation = {
  id: 'createWorkspaceMutation' as const,
  operationName: 'createWorkspace',
  definitionName: 'createWorkspace',
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
  query: `
mutation uploadAvatar($id: String!) {
  uploadAvatar(id: $id) {
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
  query: `
query workspaceById($id: String!) {
  workspace(id: $id) {
    id
    public
    createdAt
  }
}`,
};
