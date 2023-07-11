/* do not manipulate this file manually. */
export interface GraphQLQuery {
  id: string;
  operationName: string;
  definitionName: string;
  query: string;
  containsFile?: boolean;
}

export const deleteBlobMutation = {
  id: 'deleteBlobMutation' as const,
  operationName: 'deleteBlob',
  definitionName: 'deleteBlob',
  containsFile: false,
  query: `
mutation deleteBlob($workspaceId: String!, $hash: String!) {
  deleteBlob(workspaceId: $workspaceId, hash: $hash)
}`,
};

export const listBlobsQuery = {
  id: 'listBlobsQuery' as const,
  operationName: 'listBlobs',
  definitionName: 'listBlobs',
  containsFile: false,
  query: `
query listBlobs($workspaceId: String!) {
  listBlobs(workspaceId: $workspaceId)
}`,
};

export const setBlobMutation = {
  id: 'setBlobMutation' as const,
  operationName: 'setBlob',
  definitionName: 'setBlob',
  containsFile: true,
  query: `
mutation setBlob($workspaceId: String!, $blob: Upload!) {
  setBlob(workspaceId: $workspaceId, blob: $blob)
}`,
};

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

export const getCurrentUserQuery = {
  id: 'getCurrentUserQuery' as const,
  operationName: 'getCurrentUser',
  definitionName: 'currentUser',
  containsFile: false,
  query: `
query getCurrentUser {
  currentUser {
    id
    name
    email
    emailVerified
    avatarUrl
    createdAt
  }
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
      permission
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

export const revokeMemberPermissionMutation = {
  id: 'revokeMemberPermissionMutation' as const,
  operationName: 'revokeMemberPermission',
  definitionName: 'revoke',
  containsFile: false,
  query: `
mutation revokeMemberPermission($workspaceId: String!, $userId: String!) {
  revoke(workspaceId: $workspaceId, userId: $userId)
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

export const acceptInviteByInviteIdMutation = {
  id: 'acceptInviteByInviteIdMutation' as const,
  operationName: 'acceptInviteByInviteId',
  definitionName: 'acceptInviteById',
  containsFile: false,
  query: `
mutation acceptInviteByInviteId($workspaceId: String!, $inviteId: String!) {
  acceptInviteById(workspaceId: $workspaceId, inviteId: $inviteId)
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
