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

export const changeEmailMutation = {
  id: 'changeEmailMutation' as const,
  operationName: 'changeEmail',
  definitionName: 'changeEmail',
  containsFile: false,
  query: `
mutation changeEmail($id: String!, $newEmail: String!) {
  changeEmail(id: $id, email: $newEmail) {
    id
    name
    avatarUrl
    email
  }
}`,
};

export const changePasswordMutation = {
  id: 'changePasswordMutation' as const,
  operationName: 'changePassword',
  definitionName: 'changePassword',
  containsFile: false,
  query: `
mutation changePassword($id: String!, $newPassword: String!) {
  changePassword(id: $id, newPassword: $newPassword) {
    id
    name
    avatarUrl
    email
  }
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

export const deleteAccountMutation = {
  id: 'deleteAccountMutation' as const,
  operationName: 'deleteAccount',
  definitionName: 'deleteAccount',
  containsFile: false,
  query: `
mutation deleteAccount {
  deleteAccount {
    success
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

export const getInviteInfoQuery = {
  id: 'getInviteInfoQuery' as const,
  operationName: 'getInviteInfo',
  definitionName: 'getInviteInfo',
  containsFile: false,
  query: `
query getInviteInfo($inviteId: String!) {
  getInviteInfo(inviteId: $inviteId) {
    workspace {
      id
      name
      avatar
    }
    user {
      id
      name
      avatarUrl
    }
  }
}`,
};

export const getIsOwnerQuery = {
  id: 'getIsOwnerQuery' as const,
  operationName: 'getIsOwner',
  definitionName: 'isOwner',
  containsFile: false,
  query: `
query getIsOwner($workspaceId: String!) {
  isOwner(workspaceId: $workspaceId)
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
      inviteId
      accepted
      emailVerified
    }
  }
}`,
};

export const getPublicWorkspaceQuery = {
  id: 'getPublicWorkspaceQuery' as const,
  operationName: 'getPublicWorkspace',
  definitionName: 'publicWorkspace',
  containsFile: false,
  query: `
query getPublicWorkspace($id: String!) {
  publicWorkspace(id: $id) {
    id
  }
}`,
};

export const getUserQuery = {
  id: 'getUserQuery' as const,
  operationName: 'getUser',
  definitionName: 'user',
  containsFile: false,
  query: `
query getUser($email: String!) {
  user(email: $email) {
    id
    name
    avatarUrl
    email
    hasPassword
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

export const getWorkspaceSharedPagesQuery = {
  id: 'getWorkspaceSharedPagesQuery' as const,
  operationName: 'getWorkspaceSharedPages',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query getWorkspaceSharedPages($workspaceId: String!) {
  workspace(id: $workspaceId) {
    sharedPages
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

export const leaveWorkspaceMutation = {
  id: 'leaveWorkspaceMutation' as const,
  operationName: 'leaveWorkspace',
  definitionName: 'leaveWorkspace',
  containsFile: false,
  query: `
mutation leaveWorkspace($workspaceId: String!) {
  leaveWorkspace(workspaceId: $workspaceId)
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

export const revokePageMutation = {
  id: 'revokePageMutation' as const,
  operationName: 'revokePage',
  definitionName: 'revokePage',
  containsFile: false,
  query: `
mutation revokePage($workspaceId: String!, $pageId: String!) {
  revokePage(workspaceId: $workspaceId, pageId: $pageId)
}`,
};

export const sendChangeEmailMutation = {
  id: 'sendChangeEmailMutation' as const,
  operationName: 'sendChangeEmail',
  definitionName: 'sendChangeEmail',
  containsFile: false,
  query: `
mutation sendChangeEmail($email: String!, $callbackUrl: String!) {
  sendChangeEmail(email: $email, callbackUrl: $callbackUrl)
}`,
};

export const sendChangePasswordEmailMutation = {
  id: 'sendChangePasswordEmailMutation' as const,
  operationName: 'sendChangePasswordEmail',
  definitionName: 'sendChangePasswordEmail',
  containsFile: false,
  query: `
mutation sendChangePasswordEmail($email: String!, $callbackUrl: String!) {
  sendChangePasswordEmail(email: $email, callbackUrl: $callbackUrl)
}`,
};

export const sendSetPasswordEmailMutation = {
  id: 'sendSetPasswordEmailMutation' as const,
  operationName: 'sendSetPasswordEmail',
  definitionName: 'sendSetPasswordEmail',
  containsFile: false,
  query: `
mutation sendSetPasswordEmail($email: String!, $callbackUrl: String!) {
  sendSetPasswordEmail(email: $email, callbackUrl: $callbackUrl)
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

export const sharePageMutation = {
  id: 'sharePageMutation' as const,
  operationName: 'sharePage',
  definitionName: 'sharePage',
  containsFile: false,
  query: `
mutation sharePage($workspaceId: String!, $pageId: String!) {
  sharePage(workspaceId: $workspaceId, pageId: $pageId)
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
mutation inviteByEmail($workspaceId: String!, $email: String!, $permission: Permission!, $sendInviteMail: Boolean) {
  invite(
    workspaceId: $workspaceId
    email: $email
    permission: $permission
    sendInviteMail: $sendInviteMail
  )
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
