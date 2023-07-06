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

export const deleteWorkspaceMutation = {
  id: 'deleteWorkspaceMutation' as const,
  operationName: 'deleteWorkspace',
  definitionName: 'deleteWorkspace',
  containsFile: false,
  query: `
mutation deleteWorkspace($id: String!) {
  deleteWorkspace(id: $id)
}`,
};

export const getMembersByWorkspaceIdQuery = {
  id: 'getMembersByWorkspaceIdQuery' as const,
  operationName: 'getMembersByWorkspaceId',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query getMembersByWorkspaceId($workspaceId: String!) {
  workspace(id: $workspaceId) {
    members {
      id
      name
      email
      avatarUrl
    }
  }
}`,
};

export const getWorkspacePublicByIdQuery = {
  id: 'getWorkspacePublicByIdQuery' as const,
  operationName: 'getWorkspacePublicById',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query getWorkspacePublicById($id: String!) {
  workspace(id: $id) {
    public
  }
}`,
};

export const getWorkspaceQuery = {
  id: 'getWorkspaceQuery' as const,
  operationName: 'getWorkspace',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query getWorkspace($id: String!) {
  workspace(id: $id) {
    id
  }
}`,
};

export const getWorkspacesQuery = {
  id: 'getWorkspacesQuery' as const,
  operationName: 'getWorkspaces',
  definitionName: 'workspaces',
  containsFile: false,
  query: `
query getWorkspaces {
  workspaces {
    id
  }
}`,
};

export const inviteByEmailMutation = {
  id: 'inviteByEmailMutation' as const,
  operationName: 'inviteByEmail',
  definitionName: 'invite',
  containsFile: false,
  query: `
mutation inviteByEmail($workspaceId: String!, $email: String!, $permission: Permission!) {
  invite(workspaceId: $workspaceId, email: $email, permission: $permission)
}`,
};

export const setRevokePageMutation = {
  id: 'setRevokePageMutation' as const,
  operationName: 'setRevokePage',
  definitionName: 'revokePage',
  containsFile: false,
  query: `
mutation setRevokePage($workspaceId: String!, $pageId: String!) {
  revokePage(workspaceId: $workspaceId, pageId: $pageId)
}`,
};

export const setSharePageMutation = {
  id: 'setSharePageMutation' as const,
  operationName: 'setSharePage',
  definitionName: 'sharePage',
  containsFile: false,
  query: `
mutation setSharePage($workspaceId: String!, $pageId: String!) {
  sharePage(workspaceId: $workspaceId, pageId: $pageId)
}`,
};

export const setWorkspacePublicByIdMutation = {
  id: 'setWorkspacePublicByIdMutation' as const,
  operationName: 'setWorkspacePublicById',
  definitionName: 'updateWorkspace',
  containsFile: false,
  query: `
mutation setWorkspacePublicById($id: ID!, $public: Boolean!) {
  updateWorkspace(input: {id: $id, public: $public}) {
    id
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
    token {
      token
    }
  }
}`,
};

export const signUpMutation = {
  id: 'signUpMutation' as const,
  operationName: 'signUp',
  definitionName: 'signUp',
  containsFile: false,
  query: `
mutation signUp($name: String!, $email: String!, $password: String!) {
  signUp(name: $name, email: $email, password: $password) {
    token {
      token
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

export const acceptInviteByWorkspaceIdMutation = {
  id: 'acceptInviteByWorkspaceIdMutation' as const,
  operationName: 'acceptInviteByWorkspaceId',
  definitionName: 'acceptInvite',
  containsFile: false,
  query: `
mutation acceptInviteByWorkspaceId($workspaceId: String!) {
  acceptInvite(workspaceId: $workspaceId)
}`,
};

export const inviteByWorkspaceIdMutation = {
  id: 'inviteByWorkspaceIdMutation' as const,
  operationName: 'inviteByWorkspaceId',
  definitionName: 'invite',
  containsFile: false,
  query: `
mutation inviteByWorkspaceId($workspaceId: String!, $email: String!, $permission: Permission!) {
  invite(workspaceId: $workspaceId, email: $email, permission: $permission)
}`,
};
