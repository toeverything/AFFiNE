/* do not manipulate this file manually. */
export interface GraphQLQuery {
  id: string;
  operationName: string;
  definitionName: string;
  query: string;
  containsFile?: boolean;
}

export const checkBlobSizesQuery = {
  id: 'checkBlobSizesQuery' as const,
  operationName: 'checkBlobSizes',
  definitionName: 'checkBlobSize',
  containsFile: false,
  query: `
query checkBlobSizes($workspaceId: String!, $size: Float!) {
  checkBlobSize(workspaceId: $workspaceId, size: $size) {
    size
  }
}`,
};

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

export const blobSizesQuery = {
  id: 'blobSizesQuery' as const,
  operationName: 'blobSizes',
  definitionName: 'collectBlobSizes',
  containsFile: false,
  query: `
query blobSizes($workspaceId: String!) {
  collectBlobSizes(workspaceId: $workspaceId) {
    size
  }
}`,
};

export const allBlobSizesQuery = {
  id: 'allBlobSizesQuery' as const,
  operationName: 'allBlobSizes',
  definitionName: 'collectAllBlobSizes',
  containsFile: false,
  query: `
query allBlobSizes {
  collectAllBlobSizes {
    size
  }
}`,
};

export const cancelSubscriptionMutation = {
  id: 'cancelSubscriptionMutation' as const,
  operationName: 'cancelSubscription',
  definitionName: 'cancelSubscription',
  containsFile: false,
  query: `
mutation cancelSubscription($idempotencyKey: String!) {
  cancelSubscription(idempotencyKey: $idempotencyKey) {
    id
    status
    nextBillAt
    canceledAt
  }
}`,
};

export const changeEmailMutation = {
  id: 'changeEmailMutation' as const,
  operationName: 'changeEmail',
  definitionName: 'changeEmail',
  containsFile: false,
  query: `
mutation changeEmail($token: String!) {
  changeEmail(token: $token) {
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
mutation changePassword($token: String!, $newPassword: String!) {
  changePassword(token: $token, newPassword: $newPassword) {
    id
    name
    avatarUrl
    email
  }
}`,
};

export const checkoutMutation = {
  id: 'checkoutMutation' as const,
  operationName: 'checkout',
  definitionName: 'checkout',
  containsFile: false,
  query: `
mutation checkout($recurring: SubscriptionRecurring!, $idempotencyKey: String!) {
  checkout(recurring: $recurring, idempotencyKey: $idempotencyKey)
}`,
};

export const createCustomerPortalMutation = {
  id: 'createCustomerPortalMutation' as const,
  operationName: 'createCustomerPortal',
  definitionName: 'createCustomerPortal',
  containsFile: false,
  query: `
mutation createCustomerPortal {
  createCustomerPortal
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
    token {
      sessionToken
    }
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

export const getMemberCountByWorkspaceIdQuery = {
  id: 'getMemberCountByWorkspaceIdQuery' as const,
  operationName: 'getMemberCountByWorkspaceId',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query getMemberCountByWorkspaceId($workspaceId: String!) {
  workspace(id: $workspaceId) {
    memberCount
  }
}`,
};

export const getMembersByWorkspaceIdQuery = {
  id: 'getMembersByWorkspaceIdQuery' as const,
  operationName: 'getMembersByWorkspaceId',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query getMembersByWorkspaceId($workspaceId: String!, $skip: Int!, $take: Int!) {
  workspace(id: $workspaceId) {
    members(skip: $skip, take: $take) {
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

export const getWorkspacePublicPagesQuery = {
  id: 'getWorkspacePublicPagesQuery' as const,
  operationName: 'getWorkspacePublicPages',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query getWorkspacePublicPages($workspaceId: String!) {
  workspace(id: $workspaceId) {
    publicPages {
      id
      mode
    }
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

export const getInvoicesCountQuery = {
  id: 'getInvoicesCountQuery' as const,
  operationName: 'getInvoicesCount',
  definitionName: 'currentUser',
  containsFile: false,
  query: `
query getInvoicesCount {
  currentUser {
    invoiceCount
  }
}`,
};

export const invoicesQuery = {
  id: 'invoicesQuery' as const,
  operationName: 'invoices',
  definitionName: 'currentUser',
  containsFile: false,
  query: `
query invoices($take: Int!, $skip: Int!) {
  currentUser {
    invoices(take: $take, skip: $skip) {
      id
      status
      plan
      recurring
      currency
      amount
      reason
      lastPaymentError
      link
      createdAt
    }
  }
}`,
};

export const leaveWorkspaceMutation = {
  id: 'leaveWorkspaceMutation' as const,
  operationName: 'leaveWorkspace',
  definitionName: 'leaveWorkspace',
  containsFile: false,
  query: `
mutation leaveWorkspace($workspaceId: String!, $workspaceName: String!, $sendLeaveMail: Boolean) {
  leaveWorkspace(
    workspaceId: $workspaceId
    workspaceName: $workspaceName
    sendLeaveMail: $sendLeaveMail
  )
}`,
};

export const pricesQuery = {
  id: 'pricesQuery' as const,
  operationName: 'prices',
  definitionName: 'prices',
  containsFile: false,
  query: `
query prices {
  prices {
    type
    plan
    currency
    amount
    yearlyAmount
  }
}`,
};

export const publishPageMutation = {
  id: 'publishPageMutation' as const,
  operationName: 'publishPage',
  definitionName: 'publishPage',
  containsFile: false,
  query: `
mutation publishPage($workspaceId: String!, $pageId: String!, $mode: PublicPageMode = Page) {
  publishPage(workspaceId: $workspaceId, pageId: $pageId, mode: $mode) {
    id
    mode
  }
}`,
};

export const removeAvatarMutation = {
  id: 'removeAvatarMutation' as const,
  operationName: 'removeAvatar',
  definitionName: 'removeAvatar',
  containsFile: false,
  query: `
mutation removeAvatar {
  removeAvatar {
    success
  }
}`,
};

export const resumeSubscriptionMutation = {
  id: 'resumeSubscriptionMutation' as const,
  operationName: 'resumeSubscription',
  definitionName: 'resumeSubscription',
  containsFile: false,
  query: `
mutation resumeSubscription($idempotencyKey: String!) {
  resumeSubscription(idempotencyKey: $idempotencyKey) {
    id
    status
    nextBillAt
    start
    end
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

export const revokePublicPageMutation = {
  id: 'revokePublicPageMutation' as const,
  operationName: 'revokePublicPage',
  definitionName: 'revokePublicPage',
  containsFile: false,
  query: `
mutation revokePublicPage($workspaceId: String!, $pageId: String!) {
  revokePublicPage(workspaceId: $workspaceId, pageId: $pageId) {
    id
    mode
    public
  }
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

export const sendVerifyChangeEmailMutation = {
  id: 'sendVerifyChangeEmailMutation' as const,
  operationName: 'sendVerifyChangeEmail',
  definitionName: 'sendVerifyChangeEmail',
  containsFile: false,
  query: `
mutation sendVerifyChangeEmail($token: String!, $email: String!, $callbackUrl: String!) {
  sendVerifyChangeEmail(token: $token, email: $email, callbackUrl: $callbackUrl)
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

export const subscriptionQuery = {
  id: 'subscriptionQuery' as const,
  operationName: 'subscription',
  definitionName: 'currentUser',
  containsFile: false,
  query: `
query subscription {
  currentUser {
    subscription {
      id
      status
      plan
      recurring
      start
      end
      nextBillAt
      canceledAt
    }
  }
}`,
};

export const updateSubscriptionMutation = {
  id: 'updateSubscriptionMutation' as const,
  operationName: 'updateSubscription',
  definitionName: 'updateSubscriptionRecurring',
  containsFile: false,
  query: `
mutation updateSubscription($recurring: SubscriptionRecurring!, $idempotencyKey: String!) {
  updateSubscriptionRecurring(
    recurring: $recurring
    idempotencyKey: $idempotencyKey
  ) {
    id
    plan
    recurring
    nextBillAt
  }
}`,
};

export const uploadAvatarMutation = {
  id: 'uploadAvatarMutation' as const,
  operationName: 'uploadAvatar',
  definitionName: 'uploadAvatar',
  containsFile: true,
  query: `
mutation uploadAvatar($avatar: Upload!) {
  uploadAvatar(avatar: $avatar) {
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
mutation acceptInviteByInviteId($workspaceId: String!, $inviteId: String!, $sendAcceptMail: Boolean) {
  acceptInviteById(
    workspaceId: $workspaceId
    inviteId: $inviteId
    sendAcceptMail: $sendAcceptMail
  )
}`,
};
