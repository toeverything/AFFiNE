/* do not manipulate this file manually. */
export interface GraphQLQuery {
  id: string;
  op: string;
  query: string;
  file?: boolean;
  deprecations?: string[];
}
export const credentialsRequirementsFragment = `fragment CredentialsRequirements on CredentialsRequirementType {
  password {
    ...PasswordLimits
  }
}`;
export const passwordLimitsFragment = `fragment PasswordLimits on PasswordLimitsType {
  minLength
  maxLength
}`;
export const activateLicenseMutation = {
  id: 'activateLicenseMutation' as const,
  op: 'activateLicense',
  query: `mutation activateLicense($workspaceId: String!, $license: String!) {
  activateLicense(workspaceId: $workspaceId, license: $license) {
    installedAt
    validatedAt
  }
}`,
};

export const adminServerConfigQuery = {
  id: 'adminServerConfigQuery' as const,
  op: 'adminServerConfig',
  query: `query adminServerConfig {
  serverConfig {
    version
    baseUrl
    name
    features
    type
    initialized
    credentialsRequirement {
      ...CredentialsRequirements
    }
    availableUpgrade {
      changelog
      version
      publishedAt
      url
    }
    availableUserFeatures
  }
}
${passwordLimitsFragment}
${credentialsRequirementsFragment}`,
};

export const deleteBlobMutation = {
  id: 'deleteBlobMutation' as const,
  op: 'deleteBlob',
  query: `mutation deleteBlob($workspaceId: String!, $key: String!, $permanently: Boolean) {
  deleteBlob(workspaceId: $workspaceId, key: $key, permanently: $permanently)
}`,
};

export const listBlobsQuery = {
  id: 'listBlobsQuery' as const,
  op: 'listBlobs',
  query: `query listBlobs($workspaceId: String!) {
  workspace(id: $workspaceId) {
    blobs {
      key
      size
      mime
      createdAt
    }
  }
}`,
};

export const releaseDeletedBlobsMutation = {
  id: 'releaseDeletedBlobsMutation' as const,
  op: 'releaseDeletedBlobs',
  query: `mutation releaseDeletedBlobs($workspaceId: String!) {
  releaseDeletedBlobs(workspaceId: $workspaceId)
}`,
};

export const setBlobMutation = {
  id: 'setBlobMutation' as const,
  op: 'setBlob',
  query: `mutation setBlob($workspaceId: String!, $blob: Upload!) {
  setBlob(workspaceId: $workspaceId, blob: $blob)
}`,
  file: true,
};

export const cancelSubscriptionMutation = {
  id: 'cancelSubscriptionMutation' as const,
  op: 'cancelSubscription',
  query: `mutation cancelSubscription($plan: SubscriptionPlan = Pro, $workspaceId: String) {
  cancelSubscription(plan: $plan, workspaceId: $workspaceId) {
    id
    status
    nextBillAt
    canceledAt
  }
}`,
  deprecations: ["'id' is deprecated: removed"],
};

export const changeEmailMutation = {
  id: 'changeEmailMutation' as const,
  op: 'changeEmail',
  query: `mutation changeEmail($token: String!, $email: String!) {
  changeEmail(token: $token, email: $email) {
    id
    email
  }
}`,
};

export const createChangePasswordUrlMutation = {
  id: 'createChangePasswordUrlMutation' as const,
  op: 'createChangePasswordUrl',
  query: `mutation createChangePasswordUrl($callbackUrl: String!, $userId: String!) {
  createChangePasswordUrl(callbackUrl: $callbackUrl, userId: $userId)
}`,
};

export const changePasswordMutation = {
  id: 'changePasswordMutation' as const,
  op: 'changePassword',
  query: `mutation changePassword($token: String!, $userId: String!, $newPassword: String!) {
  changePassword(token: $token, userId: $userId, newPassword: $newPassword)
}`,
};

export const addContextCategoryMutation = {
  id: 'addContextCategoryMutation' as const,
  op: 'addContextCategory',
  query: `mutation addContextCategory($options: AddRemoveContextCategoryInput!) {
  addContextCategory(options: $options) {
    id
    createdAt
    type
  }
}`,
};

export const removeContextCategoryMutation = {
  id: 'removeContextCategoryMutation' as const,
  op: 'removeContextCategory',
  query: `mutation removeContextCategory($options: AddRemoveContextCategoryInput!) {
  removeContextCategory(options: $options)
}`,
};

export const createCopilotContextMutation = {
  id: 'createCopilotContextMutation' as const,
  op: 'createCopilotContext',
  query: `mutation createCopilotContext($workspaceId: String!, $sessionId: String!) {
  createCopilotContext(workspaceId: $workspaceId, sessionId: $sessionId)
}`,
};

export const addContextDocMutation = {
  id: 'addContextDocMutation' as const,
  op: 'addContextDoc',
  query: `mutation addContextDoc($options: AddContextDocInput!) {
  addContextDoc(options: $options) {
    id
    createdAt
    status
  }
}`,
};

export const removeContextDocMutation = {
  id: 'removeContextDocMutation' as const,
  op: 'removeContextDoc',
  query: `mutation removeContextDoc($options: RemoveContextDocInput!) {
  removeContextDoc(options: $options)
}`,
};

export const addContextFileMutation = {
  id: 'addContextFileMutation' as const,
  op: 'addContextFile',
  query: `mutation addContextFile($content: Upload!, $options: AddContextFileInput!) {
  addContextFile(content: $content, options: $options) {
    id
    createdAt
    name
    chunkSize
    error
    status
    blobId
  }
}`,
  file: true,
};

export const matchContextQuery = {
  id: 'matchContextQuery' as const,
  op: 'matchContext',
  query: `query matchContext($contextId: String!, $content: String!, $limit: SafeInt) {
  currentUser {
    copilot {
      contexts(contextId: $contextId) {
        matchContext(content: $content, limit: $limit) {
          fileId
          chunk
          content
          distance
        }
      }
    }
  }
}`,
};

export const removeContextFileMutation = {
  id: 'removeContextFileMutation' as const,
  op: 'removeContextFile',
  query: `mutation removeContextFile($options: RemoveContextFileInput!) {
  removeContextFile(options: $options)
}`,
};

export const listContextObjectQuery = {
  id: 'listContextObjectQuery' as const,
  op: 'listContextObject',
  query: `query listContextObject($workspaceId: String!, $sessionId: String!, $contextId: String!) {
  currentUser {
    copilot(workspaceId: $workspaceId) {
      contexts(sessionId: $sessionId, contextId: $contextId) {
        docs {
          id
          status
          createdAt
        }
        files {
          id
          name
          blobId
          chunkSize
          error
          status
          createdAt
        }
      }
    }
  }
}`,
};

export const listContextQuery = {
  id: 'listContextQuery' as const,
  op: 'listContext',
  query: `query listContext($workspaceId: String!, $sessionId: String!) {
  currentUser {
    copilot(workspaceId: $workspaceId) {
      contexts(sessionId: $sessionId) {
        id
        workspaceId
      }
    }
  }
}`,
};

export const matchWorkspaceContextQuery = {
  id: 'matchWorkspaceContextQuery' as const,
  op: 'matchWorkspaceContext',
  query: `query matchWorkspaceContext($contextId: String!, $content: String!, $limit: SafeInt) {
  currentUser {
    copilot {
      contexts(contextId: $contextId) {
        matchWorkspaceContext(content: $content, limit: $limit) {
          docId
          chunk
          content
          distance
        }
      }
    }
  }
}`,
};

export const getWorkspaceEmbeddingStatusQuery = {
  id: 'getWorkspaceEmbeddingStatusQuery' as const,
  op: 'getWorkspaceEmbeddingStatus',
  query: `query getWorkspaceEmbeddingStatus($workspaceId: String!) {
  queryWorkspaceEmbeddingStatus(workspaceId: $workspaceId) {
    total
    embedded
  }
}`,
};

export const queueWorkspaceEmbeddingMutation = {
  id: 'queueWorkspaceEmbeddingMutation' as const,
  op: 'queueWorkspaceEmbedding',
  query: `mutation queueWorkspaceEmbedding($workspaceId: String!, $docId: [String!]!) {
  queueWorkspaceEmbedding(workspaceId: $workspaceId, docId: $docId)
}`,
};

export const getCopilotHistoryIdsQuery = {
  id: 'getCopilotHistoryIdsQuery' as const,
  op: 'getCopilotHistoryIds',
  query: `query getCopilotHistoryIds($workspaceId: String!, $docId: String, $options: QueryChatHistoriesInput) {
  currentUser {
    copilot(workspaceId: $workspaceId) {
      histories(docId: $docId, options: $options) {
        sessionId
        messages {
          id
          role
          createdAt
        }
      }
    }
  }
}`,
};

export const getCopilotHistoriesQuery = {
  id: 'getCopilotHistoriesQuery' as const,
  op: 'getCopilotHistories',
  query: `query getCopilotHistories($workspaceId: String!, $docId: String, $options: QueryChatHistoriesInput) {
  currentUser {
    copilot(workspaceId: $workspaceId) {
      histories(docId: $docId, options: $options) {
        sessionId
        tokens
        action
        createdAt
        messages {
          id
          role
          content
          attachments
          createdAt
        }
      }
    }
  }
}`,
};

export const submitAudioTranscriptionMutation = {
  id: 'submitAudioTranscriptionMutation' as const,
  op: 'submitAudioTranscription',
  query: `mutation submitAudioTranscription($workspaceId: String!, $blobId: String!, $blob: Upload!) {
  submitAudioTranscription(
    blob: $blob
    blobId: $blobId
    workspaceId: $workspaceId
  ) {
    id
    status
  }
}`,
  file: true,
};

export const claimAudioTranscriptionMutation = {
  id: 'claimAudioTranscriptionMutation' as const,
  op: 'claimAudioTranscription',
  query: `mutation claimAudioTranscription($jobId: String!) {
  claimAudioTranscription(jobId: $jobId) {
    id
    status
    transcription {
      speaker
      start
      end
      transcription
    }
    summary
  }
}`,
};

export const getAudioTranscriptionQuery = {
  id: 'getAudioTranscriptionQuery' as const,
  op: 'getAudioTranscription',
  query: `query getAudioTranscription($workspaceId: String!, $jobId: String!) {
  currentUser {
    copilot(workspaceId: $workspaceId) {
      audioTranscription(jobId: $jobId) {
        id
        status
        transcription {
          speaker
          start
          end
          transcription
        }
        summary
      }
    }
  }
}`,
};

export const createCopilotMessageMutation = {
  id: 'createCopilotMessageMutation' as const,
  op: 'createCopilotMessage',
  query: `mutation createCopilotMessage($options: CreateChatMessageInput!) {
  createCopilotMessage(options: $options)
}`,
  file: true,
};

export const getPromptsQuery = {
  id: 'getPromptsQuery' as const,
  op: 'getPrompts',
  query: `query getPrompts {
  listCopilotPrompts {
    name
    model
    action
    config {
      jsonMode
      frequencyPenalty
      presencePenalty
      temperature
      topP
    }
    messages {
      role
      content
      params
    }
  }
}`,
};

export const updatePromptMutation = {
  id: 'updatePromptMutation' as const,
  op: 'updatePrompt',
  query: `mutation updatePrompt($name: String!, $messages: [CopilotPromptMessageInput!]!) {
  updateCopilotPrompt(name: $name, messages: $messages) {
    name
    model
    action
    config {
      jsonMode
      frequencyPenalty
      presencePenalty
      temperature
      topP
    }
    messages {
      role
      content
      params
    }
  }
}`,
};

export const copilotQuotaQuery = {
  id: 'copilotQuotaQuery' as const,
  op: 'copilotQuota',
  query: `query copilotQuota {
  currentUser {
    copilot {
      quota {
        limit
        used
      }
    }
  }
}`,
};

export const cleanupCopilotSessionMutation = {
  id: 'cleanupCopilotSessionMutation' as const,
  op: 'cleanupCopilotSession',
  query: `mutation cleanupCopilotSession($input: DeleteSessionInput!) {
  cleanupCopilotSession(options: $input)
}`,
};

export const createCopilotSessionMutation = {
  id: 'createCopilotSessionMutation' as const,
  op: 'createCopilotSession',
  query: `mutation createCopilotSession($options: CreateChatSessionInput!) {
  createCopilotSession(options: $options)
}`,
};

export const forkCopilotSessionMutation = {
  id: 'forkCopilotSessionMutation' as const,
  op: 'forkCopilotSession',
  query: `mutation forkCopilotSession($options: ForkChatSessionInput!) {
  forkCopilotSession(options: $options)
}`,
};

export const updateCopilotSessionMutation = {
  id: 'updateCopilotSessionMutation' as const,
  op: 'updateCopilotSession',
  query: `mutation updateCopilotSession($options: UpdateChatSessionInput!) {
  updateCopilotSession(options: $options)
}`,
};

export const getCopilotSessionsQuery = {
  id: 'getCopilotSessionsQuery' as const,
  op: 'getCopilotSessions',
  query: `query getCopilotSessions($workspaceId: String!, $docId: String, $options: QueryChatSessionsInput) {
  currentUser {
    copilot(workspaceId: $workspaceId) {
      sessions(docId: $docId, options: $options) {
        id
        parentSessionId
        promptName
      }
    }
  }
}`,
};

export const createCheckoutSessionMutation = {
  id: 'createCheckoutSessionMutation' as const,
  op: 'createCheckoutSession',
  query: `mutation createCheckoutSession($input: CreateCheckoutSessionInput!) {
  createCheckoutSession(input: $input)
}`,
};

export const createCustomerPortalMutation = {
  id: 'createCustomerPortalMutation' as const,
  op: 'createCustomerPortal',
  query: `mutation createCustomerPortal {
  createCustomerPortal
}`,
};

export const createSelfhostCustomerPortalMutation = {
  id: 'createSelfhostCustomerPortalMutation' as const,
  op: 'createSelfhostCustomerPortal',
  query: `mutation createSelfhostCustomerPortal($workspaceId: String!) {
  createSelfhostWorkspaceCustomerPortal(workspaceId: $workspaceId)
}`,
};

export const createUserMutation = {
  id: 'createUserMutation' as const,
  op: 'createUser',
  query: `mutation createUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
  }
}`,
};

export const createWorkspaceMutation = {
  id: 'createWorkspaceMutation' as const,
  op: 'createWorkspace',
  query: `mutation createWorkspace {
  createWorkspace {
    id
    public
    createdAt
  }
}`,
};

export const deactivateLicenseMutation = {
  id: 'deactivateLicenseMutation' as const,
  op: 'deactivateLicense',
  query: `mutation deactivateLicense($workspaceId: String!) {
  deactivateLicense(workspaceId: $workspaceId)
}`,
};

export const deleteAccountMutation = {
  id: 'deleteAccountMutation' as const,
  op: 'deleteAccount',
  query: `mutation deleteAccount {
  deleteAccount {
    success
  }
}`,
};

export const deleteUserMutation = {
  id: 'deleteUserMutation' as const,
  op: 'deleteUser',
  query: `mutation deleteUser($id: String!) {
  deleteUser(id: $id) {
    success
  }
}`,
};

export const deleteWorkspaceMutation = {
  id: 'deleteWorkspaceMutation' as const,
  op: 'deleteWorkspace',
  query: `mutation deleteWorkspace($id: String!) {
  deleteWorkspace(id: $id)
}`,
};

export const disableUserMutation = {
  id: 'disableUserMutation' as const,
  op: 'disableUser',
  query: `mutation disableUser($id: String!) {
  banUser(id: $id) {
    email
    disabled
  }
}`,
};

export const getDocRolePermissionsQuery = {
  id: 'getDocRolePermissionsQuery' as const,
  op: 'getDocRolePermissions',
  query: `query getDocRolePermissions($workspaceId: String!, $docId: String!) {
  workspace(id: $workspaceId) {
    doc(docId: $docId) {
      permissions {
        Doc_Copy
        Doc_Delete
        Doc_Duplicate
        Doc_Properties_Read
        Doc_Properties_Update
        Doc_Publish
        Doc_Read
        Doc_Restore
        Doc_TransferOwner
        Doc_Trash
        Doc_Update
        Doc_Users_Manage
        Doc_Users_Read
      }
    }
  }
}`,
};

export const enableUserMutation = {
  id: 'enableUserMutation' as const,
  op: 'enableUser',
  query: `mutation enableUser($id: String!) {
  enableUser(id: $id) {
    email
    disabled
  }
}`,
};

export const generateLicenseKeyMutation = {
  id: 'generateLicenseKeyMutation' as const,
  op: 'generateLicenseKey',
  query: `mutation generateLicenseKey($sessionId: String!) {
  generateLicenseKey(sessionId: $sessionId)
}`,
};

export const getCurrentUserFeaturesQuery = {
  id: 'getCurrentUserFeaturesQuery' as const,
  op: 'getCurrentUserFeatures',
  query: `query getCurrentUserFeatures {
  currentUser {
    id
    name
    email
    emailVerified
    avatarUrl
    features
  }
}`,
};

export const getCurrentUserQuery = {
  id: 'getCurrentUserQuery' as const,
  op: 'getCurrentUser',
  query: `query getCurrentUser {
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
  deprecations: ["'token' is deprecated: use [/api/auth/sign-in?native=true] instead"],
};

export const getDocDefaultRoleQuery = {
  id: 'getDocDefaultRoleQuery' as const,
  op: 'getDocDefaultRole',
  query: `query getDocDefaultRole($workspaceId: String!, $docId: String!) {
  workspace(id: $workspaceId) {
    doc(docId: $docId) {
      defaultRole
    }
  }
}`,
};

export const getInviteInfoQuery = {
  id: 'getInviteInfoQuery' as const,
  op: 'getInviteInfo',
  query: `query getInviteInfo($inviteId: String!) {
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

export const getIsAdminQuery = {
  id: 'getIsAdminQuery' as const,
  op: 'getIsAdmin',
  query: `query getIsAdmin($workspaceId: String!) {
  isAdmin(workspaceId: $workspaceId)
}`,
  deprecations: ["'isAdmin' is deprecated: use WorkspaceType[role] instead"],
};

export const getIsOwnerQuery = {
  id: 'getIsOwnerQuery' as const,
  op: 'getIsOwner',
  query: `query getIsOwner($workspaceId: String!) {
  isOwner(workspaceId: $workspaceId)
}`,
  deprecations: ["'isOwner' is deprecated: use WorkspaceType[role] instead"],
};

export const getLicenseQuery = {
  id: 'getLicenseQuery' as const,
  op: 'getLicense',
  query: `query getLicense($workspaceId: String!) {
  workspace(id: $workspaceId) {
    license {
      expiredAt
      installedAt
      quantity
      recurring
      validatedAt
    }
  }
}`,
};

export const getMemberCountByWorkspaceIdQuery = {
  id: 'getMemberCountByWorkspaceIdQuery' as const,
  op: 'getMemberCountByWorkspaceId',
  query: `query getMemberCountByWorkspaceId($workspaceId: String!) {
  workspace(id: $workspaceId) {
    memberCount
  }
}`,
};

export const getMembersByWorkspaceIdQuery = {
  id: 'getMembersByWorkspaceIdQuery' as const,
  op: 'getMembersByWorkspaceId',
  query: `query getMembersByWorkspaceId($workspaceId: String!, $skip: Int, $take: Int, $query: String) {
  workspace(id: $workspaceId) {
    memberCount
    members(skip: $skip, take: $take, query: $query) {
      id
      name
      email
      avatarUrl
      permission
      inviteId
      emailVerified
      status
    }
  }
}`,
  deprecations: ["'permission' is deprecated: Use role instead"],
};

export const oauthProvidersQuery = {
  id: 'oauthProvidersQuery' as const,
  op: 'oauthProviders',
  query: `query oauthProviders {
  serverConfig {
    oauthProviders
  }
}`,
};

export const getPageGrantedUsersListQuery = {
  id: 'getPageGrantedUsersListQuery' as const,
  op: 'getPageGrantedUsersList',
  query: `query getPageGrantedUsersList($pagination: PaginationInput!, $docId: String!, $workspaceId: String!) {
  workspace(id: $workspaceId) {
    doc(docId: $docId) {
      grantedUsersList(pagination: $pagination) {
        totalCount
        pageInfo {
          endCursor
          hasNextPage
        }
        edges {
          node {
            role
            user {
              id
              name
              email
              avatarUrl
            }
          }
        }
      }
    }
  }
}`,
};

export const getPublicUserByIdQuery = {
  id: 'getPublicUserByIdQuery' as const,
  op: 'getPublicUserById',
  query: `query getPublicUserById($id: String!) {
  publicUserById(id: $id) {
    id
    avatarUrl
    name
  }
}`,
};

export const getServerRuntimeConfigQuery = {
  id: 'getServerRuntimeConfigQuery' as const,
  op: 'getServerRuntimeConfig',
  query: `query getServerRuntimeConfig {
  serverRuntimeConfig {
    id
    module
    key
    description
    value
    type
    updatedAt
  }
}`,
};

export const getServerServiceConfigsQuery = {
  id: 'getServerServiceConfigsQuery' as const,
  op: 'getServerServiceConfigs',
  query: `query getServerServiceConfigs {
  serverServiceConfigs {
    name
    config
  }
}`,
};

export const getUserByEmailQuery = {
  id: 'getUserByEmailQuery' as const,
  op: 'getUserByEmail',
  query: `query getUserByEmail($email: String!) {
  userByEmail(email: $email) {
    id
    name
    email
    features
    hasPassword
    emailVerified
    avatarUrl
    quota {
      humanReadable {
        blobLimit
        historyPeriod
        memberLimit
        name
        storageQuota
      }
    }
  }
}`,
};

export const getUserFeaturesQuery = {
  id: 'getUserFeaturesQuery' as const,
  op: 'getUserFeatures',
  query: `query getUserFeatures {
  currentUser {
    id
    features
  }
}`,
};

export const getUserSettingsQuery = {
  id: 'getUserSettingsQuery' as const,
  op: 'getUserSettings',
  query: `query getUserSettings {
  currentUser {
    settings {
      receiveInvitationEmail
      receiveMentionEmail
    }
  }
}`,
};

export const getUserQuery = {
  id: 'getUserQuery' as const,
  op: 'getUser',
  query: `query getUser($email: String!) {
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

export const getUsersCountQuery = {
  id: 'getUsersCountQuery' as const,
  op: 'getUsersCount',
  query: `query getUsersCount {
  usersCount
}`,
};

export const getWorkspaceInfoQuery = {
  id: 'getWorkspaceInfoQuery' as const,
  op: 'getWorkspaceInfo',
  query: `query getWorkspaceInfo($workspaceId: String!) {
  isAdmin(workspaceId: $workspaceId)
  isOwner(workspaceId: $workspaceId)
  workspace(id: $workspaceId) {
    team
  }
}`,
  deprecations: ["'isAdmin' is deprecated: use WorkspaceType[role] instead","'isOwner' is deprecated: use WorkspaceType[role] instead"],
};

export const getWorkspacePageByIdQuery = {
  id: 'getWorkspacePageByIdQuery' as const,
  op: 'getWorkspacePageById',
  query: `query getWorkspacePageById($workspaceId: String!, $pageId: String!) {
  workspace(id: $workspaceId) {
    doc(docId: $pageId) {
      id
      mode
      defaultRole
      public
    }
  }
}`,
};

export const getWorkspacePageMetaByIdQuery = {
  id: 'getWorkspacePageMetaByIdQuery' as const,
  op: 'getWorkspacePageMetaById',
  query: `query getWorkspacePageMetaById($id: String!, $pageId: String!) {
  workspace(id: $id) {
    pageMeta(pageId: $pageId) {
      createdAt
      updatedAt
      createdBy {
        name
        avatarUrl
      }
      updatedBy {
        name
        avatarUrl
      }
    }
  }
}`,
};

export const getWorkspacePublicByIdQuery = {
  id: 'getWorkspacePublicByIdQuery' as const,
  op: 'getWorkspacePublicById',
  query: `query getWorkspacePublicById($id: String!) {
  workspace(id: $id) {
    public
  }
}`,
};

export const getWorkspacePublicPagesQuery = {
  id: 'getWorkspacePublicPagesQuery' as const,
  op: 'getWorkspacePublicPages',
  query: `query getWorkspacePublicPages($workspaceId: String!) {
  workspace(id: $workspaceId) {
    publicDocs {
      id
      mode
    }
  }
}`,
};

export const getWorkspaceSubscriptionQuery = {
  id: 'getWorkspaceSubscriptionQuery' as const,
  op: 'getWorkspaceSubscription',
  query: `query getWorkspaceSubscription($workspaceId: String!) {
  workspace(id: $workspaceId) {
    subscription {
      id
      status
      plan
      recurring
      start
      end
      nextBillAt
      canceledAt
      variant
    }
  }
}`,
  deprecations: ["'id' is deprecated: removed"],
};

export const getWorkspaceQuery = {
  id: 'getWorkspaceQuery' as const,
  op: 'getWorkspace',
  query: `query getWorkspace($id: String!) {
  workspace(id: $id) {
    id
  }
}`,
};

export const getWorkspacesQuery = {
  id: 'getWorkspacesQuery' as const,
  op: 'getWorkspaces',
  query: `query getWorkspaces {
  workspaces {
    id
    initialized
    team
    owner {
      id
    }
  }
}`,
};

export const grantDocUserRolesMutation = {
  id: 'grantDocUserRolesMutation' as const,
  op: 'grantDocUserRoles',
  query: `mutation grantDocUserRoles($input: GrantDocUserRolesInput!) {
  grantDocUserRoles(input: $input)
}`,
};

export const listHistoryQuery = {
  id: 'listHistoryQuery' as const,
  op: 'listHistory',
  query: `query listHistory($workspaceId: String!, $pageDocId: String!, $take: Int, $before: DateTime) {
  workspace(id: $workspaceId) {
    histories(guid: $pageDocId, take: $take, before: $before) {
      id
      timestamp
      editor {
        name
        avatarUrl
      }
    }
  }
}`,
};

export const importUsersMutation = {
  id: 'importUsersMutation' as const,
  op: 'ImportUsers',
  query: `mutation ImportUsers($input: ImportUsersInput!) {
  importUsers(input: $input) {
    __typename
    ... on UserType {
      id
      name
      email
    }
    ... on UserImportFailedType {
      email
      error
    }
  }
}`,
};

export const getInvoicesCountQuery = {
  id: 'getInvoicesCountQuery' as const,
  op: 'getInvoicesCount',
  query: `query getInvoicesCount {
  currentUser {
    invoiceCount
  }
}`,
};

export const invoicesQuery = {
  id: 'invoicesQuery' as const,
  op: 'invoices',
  query: `query invoices($take: Int!, $skip: Int!) {
  currentUser {
    invoiceCount
    invoices(take: $take, skip: $skip) {
      id
      status
      currency
      amount
      reason
      lastPaymentError
      link
      createdAt
    }
  }
}`,
  deprecations: ["'id' is deprecated: removed"],
};

export const leaveWorkspaceMutation = {
  id: 'leaveWorkspaceMutation' as const,
  op: 'leaveWorkspace',
  query: `mutation leaveWorkspace($workspaceId: String!, $sendLeaveMail: Boolean) {
  leaveWorkspace(workspaceId: $workspaceId, sendLeaveMail: $sendLeaveMail)
}`,
};

export const listNotificationsQuery = {
  id: 'listNotificationsQuery' as const,
  op: 'listNotifications',
  query: `query listNotifications($pagination: PaginationInput!) {
  currentUser {
    notifications(pagination: $pagination) {
      totalCount
      edges {
        cursor
        node {
          id
          type
          level
          read
          createdAt
          updatedAt
          body
        }
      }
      pageInfo {
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
      }
    }
  }
}`,
};

export const listUsersQuery = {
  id: 'listUsersQuery' as const,
  op: 'listUsers',
  query: `query listUsers($filter: ListUserInput!) {
  users(filter: $filter) {
    id
    name
    email
    disabled
    features
    hasPassword
    emailVerified
    avatarUrl
  }
}`,
};

export const mentionUserMutation = {
  id: 'mentionUserMutation' as const,
  op: 'mentionUser',
  query: `mutation mentionUser($input: MentionInput!) {
  mentionUser(input: $input)
}`,
};

export const notificationCountQuery = {
  id: 'notificationCountQuery' as const,
  op: 'notificationCount',
  query: `query notificationCount {
  currentUser {
    notificationCount
  }
}`,
};

export const pricesQuery = {
  id: 'pricesQuery' as const,
  op: 'prices',
  query: `query prices {
  prices {
    type
    plan
    currency
    amount
    yearlyAmount
    lifetimeAmount
  }
}`,
};

export const publishPageMutation = {
  id: 'publishPageMutation' as const,
  op: 'publishPage',
  query: `mutation publishPage($workspaceId: String!, $pageId: String!, $mode: PublicDocMode = Page) {
  publishDoc(workspaceId: $workspaceId, docId: $pageId, mode: $mode) {
    id
    mode
  }
}`,
};

export const quotaQuery = {
  id: 'quotaQuery' as const,
  op: 'quota',
  query: `query quota {
  currentUser {
    id
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
    quotaUsage {
      storageQuota
    }
  }
}`,
  deprecations: ["'storageQuota' is deprecated: use `UserQuotaType['usedStorageQuota']` instead"],
};

export const readNotificationMutation = {
  id: 'readNotificationMutation' as const,
  op: 'readNotification',
  query: `mutation readNotification($id: String!) {
  readNotification(id: $id)
}`,
};

export const recoverDocMutation = {
  id: 'recoverDocMutation' as const,
  op: 'recoverDoc',
  query: `mutation recoverDoc($workspaceId: String!, $docId: String!, $timestamp: DateTime!) {
  recoverDoc(workspaceId: $workspaceId, guid: $docId, timestamp: $timestamp)
}`,
};

export const removeAvatarMutation = {
  id: 'removeAvatarMutation' as const,
  op: 'removeAvatar',
  query: `mutation removeAvatar {
  removeAvatar {
    success
  }
}`,
};

export const resumeSubscriptionMutation = {
  id: 'resumeSubscriptionMutation' as const,
  op: 'resumeSubscription',
  query: `mutation resumeSubscription($plan: SubscriptionPlan = Pro, $workspaceId: String) {
  resumeSubscription(plan: $plan, workspaceId: $workspaceId) {
    id
    status
    nextBillAt
    start
    end
  }
}`,
  deprecations: ["'id' is deprecated: removed"],
};

export const revokeDocUserRolesMutation = {
  id: 'revokeDocUserRolesMutation' as const,
  op: 'revokeDocUserRoles',
  query: `mutation revokeDocUserRoles($input: RevokeDocUserRoleInput!) {
  revokeDocUserRoles(input: $input)
}`,
};

export const revokeMemberPermissionMutation = {
  id: 'revokeMemberPermissionMutation' as const,
  op: 'revokeMemberPermission',
  query: `mutation revokeMemberPermission($workspaceId: String!, $userId: String!) {
  revoke(workspaceId: $workspaceId, userId: $userId)
}`,
};

export const revokePublicPageMutation = {
  id: 'revokePublicPageMutation' as const,
  op: 'revokePublicPage',
  query: `mutation revokePublicPage($workspaceId: String!, $pageId: String!) {
  revokePublicDoc(workspaceId: $workspaceId, docId: $pageId) {
    id
    mode
    public
  }
}`,
};

export const sendChangeEmailMutation = {
  id: 'sendChangeEmailMutation' as const,
  op: 'sendChangeEmail',
  query: `mutation sendChangeEmail($callbackUrl: String!) {
  sendChangeEmail(callbackUrl: $callbackUrl)
}`,
};

export const sendChangePasswordEmailMutation = {
  id: 'sendChangePasswordEmailMutation' as const,
  op: 'sendChangePasswordEmail',
  query: `mutation sendChangePasswordEmail($callbackUrl: String!) {
  sendChangePasswordEmail(callbackUrl: $callbackUrl)
}`,
};

export const sendSetPasswordEmailMutation = {
  id: 'sendSetPasswordEmailMutation' as const,
  op: 'sendSetPasswordEmail',
  query: `mutation sendSetPasswordEmail($callbackUrl: String!) {
  sendSetPasswordEmail(callbackUrl: $callbackUrl)
}`,
};

export const sendVerifyChangeEmailMutation = {
  id: 'sendVerifyChangeEmailMutation' as const,
  op: 'sendVerifyChangeEmail',
  query: `mutation sendVerifyChangeEmail($token: String!, $email: String!, $callbackUrl: String!) {
  sendVerifyChangeEmail(token: $token, email: $email, callbackUrl: $callbackUrl)
}`,
};

export const sendVerifyEmailMutation = {
  id: 'sendVerifyEmailMutation' as const,
  op: 'sendVerifyEmail',
  query: `mutation sendVerifyEmail($callbackUrl: String!) {
  sendVerifyEmail(callbackUrl: $callbackUrl)
}`,
};

export const serverConfigQuery = {
  id: 'serverConfigQuery' as const,
  op: 'serverConfig',
  query: `query serverConfig {
  serverConfig {
    version
    baseUrl
    name
    features
    type
    initialized
    credentialsRequirement {
      ...CredentialsRequirements
    }
  }
}
${passwordLimitsFragment}
${credentialsRequirementsFragment}`,
};

export const setWorkspacePublicByIdMutation = {
  id: 'setWorkspacePublicByIdMutation' as const,
  op: 'setWorkspacePublicById',
  query: `mutation setWorkspacePublicById($id: ID!, $public: Boolean!) {
  updateWorkspace(input: {id: $id, public: $public}) {
    id
  }
}`,
};

export const subscriptionQuery = {
  id: 'subscriptionQuery' as const,
  op: 'subscription',
  query: `query subscription {
  currentUser {
    id
    subscriptions {
      id
      status
      plan
      recurring
      start
      end
      nextBillAt
      canceledAt
      variant
    }
  }
}`,
  deprecations: ["'id' is deprecated: removed"],
};

export const updateAccountFeaturesMutation = {
  id: 'updateAccountFeaturesMutation' as const,
  op: 'updateAccountFeatures',
  query: `mutation updateAccountFeatures($userId: String!, $features: [FeatureType!]!) {
  updateUserFeatures(id: $userId, features: $features)
}`,
};

export const updateAccountMutation = {
  id: 'updateAccountMutation' as const,
  op: 'updateAccount',
  query: `mutation updateAccount($id: String!, $input: ManageUserInput!) {
  updateUser(id: $id, input: $input) {
    id
    name
    email
  }
}`,
};

export const updateDocDefaultRoleMutation = {
  id: 'updateDocDefaultRoleMutation' as const,
  op: 'updateDocDefaultRole',
  query: `mutation updateDocDefaultRole($input: UpdateDocDefaultRoleInput!) {
  updateDocDefaultRole(input: $input)
}`,
};

export const updateDocUserRoleMutation = {
  id: 'updateDocUserRoleMutation' as const,
  op: 'updateDocUserRole',
  query: `mutation updateDocUserRole($input: UpdateDocUserRoleInput!) {
  updateDocUserRole(input: $input)
}`,
};

export const updateServerRuntimeConfigsMutation = {
  id: 'updateServerRuntimeConfigsMutation' as const,
  op: 'updateServerRuntimeConfigs',
  query: `mutation updateServerRuntimeConfigs($updates: JSONObject!) {
  updateRuntimeConfigs(updates: $updates) {
    key
    value
  }
}`,
};

export const updateSubscriptionMutation = {
  id: 'updateSubscriptionMutation' as const,
  op: 'updateSubscription',
  query: `mutation updateSubscription($plan: SubscriptionPlan = Pro, $recurring: SubscriptionRecurring!, $workspaceId: String) {
  updateSubscriptionRecurring(
    plan: $plan
    recurring: $recurring
    workspaceId: $workspaceId
  ) {
    id
    plan
    recurring
    nextBillAt
  }
}`,
  deprecations: ["'id' is deprecated: removed"],
};

export const updateUserProfileMutation = {
  id: 'updateUserProfileMutation' as const,
  op: 'updateUserProfile',
  query: `mutation updateUserProfile($input: UpdateUserInput!) {
  updateProfile(input: $input) {
    id
    name
  }
}`,
};

export const updateUserSettingsMutation = {
  id: 'updateUserSettingsMutation' as const,
  op: 'updateUserSettings',
  query: `mutation updateUserSettings($input: UpdateSettingsInput!) {
  updateSettings(input: $input)
}`,
};

export const uploadAvatarMutation = {
  id: 'uploadAvatarMutation' as const,
  op: 'uploadAvatar',
  query: `mutation uploadAvatar($avatar: Upload!) {
  uploadAvatar(avatar: $avatar) {
    id
    name
    avatarUrl
    email
  }
}`,
  file: true,
};

export const verifyEmailMutation = {
  id: 'verifyEmailMutation' as const,
  op: 'verifyEmail',
  query: `mutation verifyEmail($token: String!) {
  verifyEmail(token: $token)
}`,
};

export const getWorkspaceConfigQuery = {
  id: 'getWorkspaceConfigQuery' as const,
  op: 'getWorkspaceConfig',
  query: `query getWorkspaceConfig($id: String!) {
  workspace(id: $id) {
    enableAi
    enableUrlPreview
    inviteLink {
      link
      expireTime
    }
  }
}`,
};

export const setEnableAiMutation = {
  id: 'setEnableAiMutation' as const,
  op: 'setEnableAi',
  query: `mutation setEnableAi($id: ID!, $enableAi: Boolean!) {
  updateWorkspace(input: {id: $id, enableAi: $enableAi}) {
    id
  }
}`,
};

export const setEnableUrlPreviewMutation = {
  id: 'setEnableUrlPreviewMutation' as const,
  op: 'setEnableUrlPreview',
  query: `mutation setEnableUrlPreview($id: ID!, $enableUrlPreview: Boolean!) {
  updateWorkspace(input: {id: $id, enableUrlPreview: $enableUrlPreview}) {
    id
  }
}`,
};

export const inviteByEmailMutation = {
  id: 'inviteByEmailMutation' as const,
  op: 'inviteByEmail',
  query: `mutation inviteByEmail($workspaceId: String!, $email: String!, $sendInviteMail: Boolean) {
  invite(
    workspaceId: $workspaceId
    email: $email
    sendInviteMail: $sendInviteMail
  )
}`,
};

export const inviteByEmailsMutation = {
  id: 'inviteByEmailsMutation' as const,
  op: 'inviteByEmails',
  query: `mutation inviteByEmails($workspaceId: String!, $emails: [String!]!, $sendInviteMail: Boolean) {
  inviteBatch(
    workspaceId: $workspaceId
    emails: $emails
    sendInviteMail: $sendInviteMail
  ) {
    email
    inviteId
    sentSuccess
  }
}`,
};

export const acceptInviteByInviteIdMutation = {
  id: 'acceptInviteByInviteIdMutation' as const,
  op: 'acceptInviteByInviteId',
  query: `mutation acceptInviteByInviteId($workspaceId: String!, $inviteId: String!, $sendAcceptMail: Boolean) {
  acceptInviteById(
    workspaceId: $workspaceId
    inviteId: $inviteId
    sendAcceptMail: $sendAcceptMail
  )
}`,
};

export const inviteBatchMutation = {
  id: 'inviteBatchMutation' as const,
  op: 'inviteBatch',
  query: `mutation inviteBatch($workspaceId: String!, $emails: [String!]!, $sendInviteMail: Boolean) {
  inviteBatch(
    workspaceId: $workspaceId
    emails: $emails
    sendInviteMail: $sendInviteMail
  ) {
    email
    inviteId
    sentSuccess
  }
}`,
};

export const createInviteLinkMutation = {
  id: 'createInviteLinkMutation' as const,
  op: 'createInviteLink',
  query: `mutation createInviteLink($workspaceId: String!, $expireTime: WorkspaceInviteLinkExpireTime!) {
  createInviteLink(workspaceId: $workspaceId, expireTime: $expireTime) {
    link
    expireTime
  }
}`,
};

export const revokeInviteLinkMutation = {
  id: 'revokeInviteLinkMutation' as const,
  op: 'revokeInviteLink',
  query: `mutation revokeInviteLink($workspaceId: String!) {
  revokeInviteLink(workspaceId: $workspaceId)
}`,
};

export const workspaceInvoicesQuery = {
  id: 'workspaceInvoicesQuery' as const,
  op: 'workspaceInvoices',
  query: `query workspaceInvoices($take: Int!, $skip: Int!, $workspaceId: String!) {
  workspace(id: $workspaceId) {
    invoiceCount
    invoices(take: $take, skip: $skip) {
      id
      status
      currency
      amount
      reason
      lastPaymentError
      link
      createdAt
    }
  }
}`,
  deprecations: ["'id' is deprecated: removed"],
};

export const workspaceQuotaQuery = {
  id: 'workspaceQuotaQuery' as const,
  op: 'workspaceQuota',
  query: `query workspaceQuota($id: String!) {
  workspace(id: $id) {
    quota {
      name
      blobLimit
      storageQuota
      usedStorageQuota
      historyPeriod
      memberLimit
      memberCount
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

export const getWorkspaceRolePermissionsQuery = {
  id: 'getWorkspaceRolePermissionsQuery' as const,
  op: 'getWorkspaceRolePermissions',
  query: `query getWorkspaceRolePermissions($id: String!) {
  workspaceRolePermissions(id: $id) {
    permissions {
      Workspace_Administrators_Manage
      Workspace_Blobs_List
      Workspace_Blobs_Read
      Workspace_Blobs_Write
      Workspace_Copilot
      Workspace_CreateDoc
      Workspace_Delete
      Workspace_Organize_Read
      Workspace_Payment_Manage
      Workspace_Properties_Create
      Workspace_Properties_Delete
      Workspace_Properties_Read
      Workspace_Properties_Update
      Workspace_Read
      Workspace_Settings_Read
      Workspace_Settings_Update
      Workspace_Sync
      Workspace_TransferOwner
      Workspace_Users_Manage
      Workspace_Users_Read
    }
  }
}`,
  deprecations: ["'workspaceRolePermissions' is deprecated: use WorkspaceType[permissions] instead"],
};

export const approveWorkspaceTeamMemberMutation = {
  id: 'approveWorkspaceTeamMemberMutation' as const,
  op: 'approveWorkspaceTeamMember',
  query: `mutation approveWorkspaceTeamMember($workspaceId: String!, $userId: String!) {
  approveMember(workspaceId: $workspaceId, userId: $userId)
}`,
};

export const grantWorkspaceTeamMemberMutation = {
  id: 'grantWorkspaceTeamMemberMutation' as const,
  op: 'grantWorkspaceTeamMember',
  query: `mutation grantWorkspaceTeamMember($workspaceId: String!, $userId: String!, $permission: Permission!) {
  grantMember(workspaceId: $workspaceId, userId: $userId, permission: $permission)
}`,
};
