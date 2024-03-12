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
query checkBlobSizes($workspaceId: String!, $size: SafeInt!) {
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
  definitionName: 'workspace',
  containsFile: false,
  query: `
query blobSizes($workspaceId: String!) {
  workspace(id: $workspaceId) {
    blobsSize
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
mutation changeEmail($token: String!, $email: String!) {
  changeEmail(token: $token, email: $email) {
    id
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
  }
}`,
};

export const createCheckoutSessionMutation = {
  id: 'createCheckoutSessionMutation' as const,
  operationName: 'createCheckoutSession',
  definitionName: 'createCheckoutSession',
  containsFile: false,
  query: `
mutation createCheckoutSession($input: CreateCheckoutSessionInput!) {
  createCheckoutSession(input: $input)
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

export const addToEarlyAccessMutation = {
  id: 'addToEarlyAccessMutation' as const,
  operationName: 'addToEarlyAccess',
  definitionName: 'addToEarlyAccess',
  containsFile: false,
  query: `
mutation addToEarlyAccess($email: String!) {
  addToEarlyAccess(email: $email)
}`,
};

export const earlyAccessUsersQuery = {
  id: 'earlyAccessUsersQuery' as const,
  operationName: 'earlyAccessUsers',
  definitionName: 'earlyAccessUsers',
  containsFile: false,
  query: `
query earlyAccessUsers {
  earlyAccessUsers {
    id
    name
    email
    avatarUrl
    emailVerified
    subscription {
      plan
      recurring
      status
      start
      end
    }
  }
}`,
};

export const removeEarlyAccessMutation = {
  id: 'removeEarlyAccessMutation' as const,
  operationName: 'removeEarlyAccess',
  definitionName: 'removeEarlyAccess',
  containsFile: false,
  query: `
mutation removeEarlyAccess($email: String!) {
  removeEarlyAccess(email: $email)
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

export const oauthProvidersQuery = {
  id: 'oauthProvidersQuery' as const,
  operationName: 'oauthProviders',
  definitionName: 'serverConfig',
  containsFile: false,
  query: `
query oauthProviders {
  serverConfig {
    oauthProviders
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
    __typename
    ... on UserType {
      id
      name
      avatarUrl
      email
      hasPassword
    }
    ... on LimitedUserType {
      email
      hasPassword
    }
  }
}`,
};

export const getWorkspaceFeaturesQuery = {
  id: 'getWorkspaceFeaturesQuery' as const,
  operationName: 'getWorkspaceFeatures',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query getWorkspaceFeatures($workspaceId: String!) {
  workspace(id: $workspaceId) {
    features
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

export const listHistoryQuery = {
  id: 'listHistoryQuery' as const,
  operationName: 'listHistory',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query listHistory($workspaceId: String!, $pageDocId: String!, $take: Int, $before: DateTime) {
  workspace(id: $workspaceId) {
    histories(guid: $pageDocId, take: $take, before: $before) {
      id
      timestamp
    }
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

export const quotaQuery = {
  id: 'quotaQuery' as const,
  operationName: 'quota',
  definitionName: 'currentUser',
  containsFile: false,
  query: `
query quota {
  currentUser {
    quota {
      name
      blobLimit
      storageQuota
      historyPeriod
      memberLimit
      humanReadable {
        name
        blobLimit
        storageQuota
        historyPeriod
        memberLimit
      }
    }
  }
}`,
};

export const recoverDocMutation = {
  id: 'recoverDocMutation' as const,
  operationName: 'recoverDoc',
  definitionName: 'recoverDoc',
  containsFile: false,
  query: `
mutation recoverDoc($workspaceId: String!, $docId: String!, $timestamp: DateTime!) {
  recoverDoc(workspaceId: $workspaceId, guid: $docId, timestamp: $timestamp)
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
mutation sendChangeEmail($callbackUrl: String!) {
  sendChangeEmail(callbackUrl: $callbackUrl)
}`,
};

export const sendChangePasswordEmailMutation = {
  id: 'sendChangePasswordEmailMutation' as const,
  operationName: 'sendChangePasswordEmail',
  definitionName: 'sendChangePasswordEmail',
  containsFile: false,
  query: `
mutation sendChangePasswordEmail($callbackUrl: String!) {
  sendChangePasswordEmail(callbackUrl: $callbackUrl)
}`,
};

export const sendSetPasswordEmailMutation = {
  id: 'sendSetPasswordEmailMutation' as const,
  operationName: 'sendSetPasswordEmail',
  definitionName: 'sendSetPasswordEmail',
  containsFile: false,
  query: `
mutation sendSetPasswordEmail($callbackUrl: String!) {
  sendSetPasswordEmail(callbackUrl: $callbackUrl)
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

export const sendVerifyEmailMutation = {
  id: 'sendVerifyEmailMutation' as const,
  operationName: 'sendVerifyEmail',
  definitionName: 'sendVerifyEmail',
  containsFile: false,
  query: `
mutation sendVerifyEmail($callbackUrl: String!) {
  sendVerifyEmail(callbackUrl: $callbackUrl)
}`,
};

export const serverConfigQuery = {
  id: 'serverConfigQuery' as const,
  operationName: 'serverConfig',
  definitionName: 'serverConfig',
  containsFile: false,
  query: `
query serverConfig {
  serverConfig {
    version
    baseUrl
    name
    features
    type
  }
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

export const updateUserProfileMutation = {
  id: 'updateUserProfileMutation' as const,
  operationName: 'updateUserProfile',
  definitionName: 'updateProfile',
  containsFile: false,
  query: `
mutation updateUserProfile($input: UpdateUserInput!) {
  updateProfile(input: $input) {
    id
    name
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

export const verifyEmailMutation = {
  id: 'verifyEmailMutation' as const,
  operationName: 'verifyEmail',
  definitionName: 'verifyEmail',
  containsFile: false,
  query: `
mutation verifyEmail($token: String!) {
  verifyEmail(token: $token)
}`,
};

export const enabledFeaturesQuery = {
  id: 'enabledFeaturesQuery' as const,
  operationName: 'enabledFeatures',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query enabledFeatures($id: String!) {
  workspace(id: $id) {
    features
  }
}`,
};

export const availableFeaturesQuery = {
  id: 'availableFeaturesQuery' as const,
  operationName: 'availableFeatures',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query availableFeatures($id: String!) {
  workspace(id: $id) {
    availableFeatures
  }
}`,
};

export const setWorkspaceExperimentalFeatureMutation = {
  id: 'setWorkspaceExperimentalFeatureMutation' as const,
  operationName: 'setWorkspaceExperimentalFeature',
  definitionName: 'setWorkspaceExperimentalFeature',
  containsFile: false,
  query: `
mutation setWorkspaceExperimentalFeature($workspaceId: String!, $feature: FeatureType!, $enable: Boolean!) {
  setWorkspaceExperimentalFeature(
    workspaceId: $workspaceId
    feature: $feature
    enable: $enable
  )
}`,
};

export const addWorkspaceFeatureMutation = {
  id: 'addWorkspaceFeatureMutation' as const,
  operationName: 'addWorkspaceFeature',
  definitionName: 'addWorkspaceFeature',
  containsFile: false,
  query: `
mutation addWorkspaceFeature($workspaceId: String!, $feature: FeatureType!) {
  addWorkspaceFeature(workspaceId: $workspaceId, feature: $feature)
}`,
};

export const listWorkspaceFeaturesQuery = {
  id: 'listWorkspaceFeaturesQuery' as const,
  operationName: 'listWorkspaceFeatures',
  definitionName: 'listWorkspaceFeatures',
  containsFile: false,
  query: `
query listWorkspaceFeatures($feature: FeatureType!) {
  listWorkspaceFeatures(feature: $feature) {
    id
    public
    createdAt
    memberCount
    owner {
      id
    }
    features
  }
}`,
};

export const removeWorkspaceFeatureMutation = {
  id: 'removeWorkspaceFeatureMutation' as const,
  operationName: 'removeWorkspaceFeature',
  definitionName: 'removeWorkspaceFeature',
  containsFile: false,
  query: `
mutation removeWorkspaceFeature($workspaceId: String!, $feature: FeatureType!) {
  removeWorkspaceFeature(workspaceId: $workspaceId, feature: $feature)
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

export const workspaceQuotaQuery = {
  id: 'workspaceQuotaQuery' as const,
  operationName: 'workspaceQuota',
  definitionName: 'workspace',
  containsFile: false,
  query: `
query workspaceQuota($id: String!) {
  workspace(id: $id) {
    quota {
      name
      blobLimit
      storageQuota
      historyPeriod
      memberLimit
      humanReadable {
        name
        blobLimit
        storageQuota
        historyPeriod
        memberLimit
      }
      usedSize
    }
  }
}`,
};
