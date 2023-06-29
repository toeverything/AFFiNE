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
  containsFile: true,
  query: `
mutation createWorkspace($init: Upload!) {
  createWorkspace(init: $init) {
    id
    public
    createdAt
  }
}`,
};

export const registerMutation = {
  id: 'registerMutation' as const,
  operationName: 'register',
  definitionName: 'register',
  containsFile: false,
  query: `
mutation register($name: String!, $email: String!, $password: String!) {
  register(name: $name, email: $email, password: $password) {
    id
    name
    email
    avatarUrl
    createdAt
    token {
      token
      refresh
    }
  }
}`,
};

export const signInMutation = {
  id: 'signInMutation' as const,
  operationName: 'signIn',
  definitionName: 'signIn',
  containsFile: false,
  query: `
mutation signIn($email: String!, $password: String!) {
  signIn(email: $email, password: $password) {
    id
    email
    name
    avatarUrl
    createdAt
    token {
      token
      refresh
    }
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
