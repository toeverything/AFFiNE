/* do not manipulate this file manually. */
export interface GraphQLQuery {
  id: string;
  operationName: string;
  definitionName: string;
  query: string;
}

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
