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
    created_at
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
    type
    public
    created_at
  }
}`,
};
