export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export interface Scalars {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  /** A date-time string at UTC, such as 2019-12-03T09:54:33Z, compliant with the date-time format. */
  DateTime: { input: string; output: string };
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: Record<string, string>; output: Record<string, string> };
  /** The `JSONObject` scalar type represents JSON objects as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSONObject: { input: any; output: any };
  /** The `SafeInt` scalar type represents non-fractional signed whole numeric values that are considered safe as defined by the ECMAScript specification. */
  SafeInt: { input: number; output: number };
  /** The `Upload` scalar type represents a file upload. */
  Upload: { input: File; output: File };
}

export interface AddContextDocInput {
  contextId: Scalars['String']['input'];
  docId: Scalars['String']['input'];
}

export interface AddContextFileInput {
  blobId: Scalars['String']['input'];
  contextId: Scalars['String']['input'];
}

export interface AddRemoveContextCategoryInput {
  categoryId: Scalars['String']['input'];
  contextId: Scalars['String']['input'];
  type: ContextCategories;
}

export enum AiJobStatus {
  claimed = 'claimed',
  failed = 'failed',
  finished = 'finished',
  pending = 'pending',
  running = 'running',
}

export interface AlreadyInSpaceDataType {
  __typename?: 'AlreadyInSpaceDataType';
  spaceId: Scalars['String']['output'];
}

export interface BlobNotFoundDataType {
  __typename?: 'BlobNotFoundDataType';
  blobId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
}

export enum ChatHistoryOrder {
  asc = 'asc',
  desc = 'desc',
}

export interface ChatMessage {
  __typename?: 'ChatMessage';
  attachments: Maybe<Array<Scalars['String']['output']>>;
  content: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Maybe<Scalars['ID']['output']>;
  params: Maybe<Scalars['JSON']['output']>;
  role: Scalars['String']['output'];
}

export enum ContextCategories {
  Collection = 'Collection',
  Tag = 'Tag',
}

export enum ContextEmbedStatus {
  failed = 'failed',
  finished = 'finished',
  processing = 'processing',
}

export interface ContextMatchedDocChunk {
  __typename?: 'ContextMatchedDocChunk';
  chunk: Scalars['SafeInt']['output'];
  content: Scalars['String']['output'];
  distance: Maybe<Scalars['Float']['output']>;
  docId: Scalars['String']['output'];
}

export interface ContextMatchedFileChunk {
  __typename?: 'ContextMatchedFileChunk';
  chunk: Scalars['SafeInt']['output'];
  content: Scalars['String']['output'];
  distance: Maybe<Scalars['Float']['output']>;
  fileId: Scalars['String']['output'];
}

export interface ContextWorkspaceEmbeddingStatus {
  __typename?: 'ContextWorkspaceEmbeddingStatus';
  embedded: Scalars['SafeInt']['output'];
  total: Scalars['SafeInt']['output'];
}

export interface Copilot {
  __typename?: 'Copilot';
  audioTranscription: Array<TranscriptionResultType>;
  /** Get the context list of a session */
  contexts: Array<CopilotContext>;
  histories: Array<CopilotHistories>;
  /** Get the quota of the user in the workspace */
  quota: CopilotQuota;
  /**
   * Get the session id list in the workspace
   * @deprecated Use `sessions` instead
   */
  sessionIds: Array<Scalars['String']['output']>;
  /** Get the session list in the workspace */
  sessions: Array<CopilotSessionType>;
  workspaceId: Maybe<Scalars['ID']['output']>;
}

export interface CopilotAudioTranscriptionArgs {
  jobId?: InputMaybe<Scalars['String']['input']>;
}

export interface CopilotContextsArgs {
  contextId?: InputMaybe<Scalars['String']['input']>;
  sessionId?: InputMaybe<Scalars['String']['input']>;
}

export interface CopilotHistoriesArgs {
  docId?: InputMaybe<Scalars['String']['input']>;
  options?: InputMaybe<QueryChatHistoriesInput>;
}

export interface CopilotSessionIdsArgs {
  docId?: InputMaybe<Scalars['String']['input']>;
  options?: InputMaybe<QueryChatSessionsInput>;
}

export interface CopilotSessionsArgs {
  docId?: InputMaybe<Scalars['String']['input']>;
  options?: InputMaybe<QueryChatSessionsInput>;
}

export interface CopilotContext {
  __typename?: 'CopilotContext';
  /** list files in context */
  docs: Array<CopilotContextDoc>;
  /** list files in context */
  files: Array<CopilotContextFile>;
  id: Scalars['ID']['output'];
  /** match file context */
  matchContext: Array<ContextMatchedFileChunk>;
  /** match workspace doc content */
  matchWorkspaceContext: ContextMatchedDocChunk;
  workspaceId: Scalars['String']['output'];
}

export interface CopilotContextMatchContextArgs {
  content: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['SafeInt']['input']>;
  threshold?: InputMaybe<Scalars['Float']['input']>;
}

export interface CopilotContextMatchWorkspaceContextArgs {
  content: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['SafeInt']['input']>;
}

export interface CopilotContextCategory {
  __typename?: 'CopilotContextCategory';
  createdAt: Scalars['SafeInt']['output'];
  id: Scalars['ID']['output'];
  type: ContextCategories;
}

export interface CopilotContextDoc {
  __typename?: 'CopilotContextDoc';
  createdAt: Scalars['SafeInt']['output'];
  id: Scalars['ID']['output'];
  status: Maybe<ContextEmbedStatus>;
}

export interface CopilotContextFile {
  __typename?: 'CopilotContextFile';
  blobId: Scalars['String']['output'];
  chunkSize: Scalars['SafeInt']['output'];
  createdAt: Scalars['SafeInt']['output'];
  error: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  status: ContextEmbedStatus;
}

export interface CopilotContextFileNotSupportedDataType {
  __typename?: 'CopilotContextFileNotSupportedDataType';
  fileName: Scalars['String']['output'];
  message: Scalars['String']['output'];
}

export interface CopilotDocNotFoundDataType {
  __typename?: 'CopilotDocNotFoundDataType';
  docId: Scalars['String']['output'];
}

export interface CopilotFailedToMatchContextDataType {
  __typename?: 'CopilotFailedToMatchContextDataType';
  content: Scalars['String']['output'];
  contextId: Scalars['String']['output'];
  message: Scalars['String']['output'];
}

export interface CopilotFailedToModifyContextDataType {
  __typename?: 'CopilotFailedToModifyContextDataType';
  contextId: Scalars['String']['output'];
  message: Scalars['String']['output'];
}

export interface CopilotHistories {
  __typename?: 'CopilotHistories';
  /** An mark identifying which view to use to display the session */
  action: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  messages: Array<ChatMessage>;
  sessionId: Scalars['String']['output'];
  /** The number of tokens used in the session */
  tokens: Scalars['Int']['output'];
}

export interface CopilotInvalidContextDataType {
  __typename?: 'CopilotInvalidContextDataType';
  contextId: Scalars['String']['output'];
}

export interface CopilotMessageNotFoundDataType {
  __typename?: 'CopilotMessageNotFoundDataType';
  messageId: Scalars['String']['output'];
}

export enum CopilotModels {
  DallE3 = 'DallE3',
  Gpt4Omni = 'Gpt4Omni',
  Gpt4Omni0806 = 'Gpt4Omni0806',
  Gpt4OmniMini = 'Gpt4OmniMini',
  Gpt4OmniMini0718 = 'Gpt4OmniMini0718',
  TextEmbedding3Large = 'TextEmbedding3Large',
  TextEmbedding3Small = 'TextEmbedding3Small',
  TextEmbeddingAda002 = 'TextEmbeddingAda002',
  TextModerationLatest = 'TextModerationLatest',
  TextModerationStable = 'TextModerationStable',
}

export interface CopilotPromptConfigInput {
  frequencyPenalty?: InputMaybe<Scalars['Float']['input']>;
  jsonMode?: InputMaybe<Scalars['Boolean']['input']>;
  presencePenalty?: InputMaybe<Scalars['Float']['input']>;
  temperature?: InputMaybe<Scalars['Float']['input']>;
  topP?: InputMaybe<Scalars['Float']['input']>;
}

export interface CopilotPromptConfigType {
  __typename?: 'CopilotPromptConfigType';
  frequencyPenalty: Maybe<Scalars['Float']['output']>;
  jsonMode: Maybe<Scalars['Boolean']['output']>;
  presencePenalty: Maybe<Scalars['Float']['output']>;
  temperature: Maybe<Scalars['Float']['output']>;
  topP: Maybe<Scalars['Float']['output']>;
}

export interface CopilotPromptMessageInput {
  content: Scalars['String']['input'];
  params?: InputMaybe<Scalars['JSON']['input']>;
  role: CopilotPromptMessageRole;
}

export enum CopilotPromptMessageRole {
  assistant = 'assistant',
  system = 'system',
  user = 'user',
}

export interface CopilotPromptMessageType {
  __typename?: 'CopilotPromptMessageType';
  content: Scalars['String']['output'];
  params: Maybe<Scalars['JSON']['output']>;
  role: CopilotPromptMessageRole;
}

export interface CopilotPromptNotFoundDataType {
  __typename?: 'CopilotPromptNotFoundDataType';
  name: Scalars['String']['output'];
}

export interface CopilotPromptType {
  __typename?: 'CopilotPromptType';
  action: Maybe<Scalars['String']['output']>;
  config: Maybe<CopilotPromptConfigType>;
  messages: Array<CopilotPromptMessageType>;
  model: Scalars['String']['output'];
  name: Scalars['String']['output'];
}

export interface CopilotProviderSideErrorDataType {
  __typename?: 'CopilotProviderSideErrorDataType';
  kind: Scalars['String']['output'];
  message: Scalars['String']['output'];
  provider: Scalars['String']['output'];
}

export interface CopilotQuota {
  __typename?: 'CopilotQuota';
  limit: Maybe<Scalars['SafeInt']['output']>;
  used: Scalars['SafeInt']['output'];
}

export interface CopilotSessionType {
  __typename?: 'CopilotSessionType';
  id: Scalars['ID']['output'];
  parentSessionId: Maybe<Scalars['ID']['output']>;
  promptName: Scalars['String']['output'];
}

export interface CreateChatMessageInput {
  attachments?: InputMaybe<Array<Scalars['String']['input']>>;
  blobs?: InputMaybe<Array<Scalars['Upload']['input']>>;
  content?: InputMaybe<Scalars['String']['input']>;
  params?: InputMaybe<Scalars['JSON']['input']>;
  sessionId: Scalars['String']['input'];
}

export interface CreateChatSessionInput {
  docId: Scalars['String']['input'];
  /** The prompt name to use for the session */
  promptName: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface CreateCheckoutSessionInput {
  args?: InputMaybe<Scalars['JSONObject']['input']>;
  coupon?: InputMaybe<Scalars['String']['input']>;
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  plan?: InputMaybe<SubscriptionPlan>;
  recurring?: InputMaybe<SubscriptionRecurring>;
  successCallbackLink: Scalars['String']['input'];
  variant?: InputMaybe<SubscriptionVariant>;
}

export interface CreateCopilotPromptInput {
  action?: InputMaybe<Scalars['String']['input']>;
  config?: InputMaybe<CopilotPromptConfigInput>;
  messages: Array<CopilotPromptMessageInput>;
  model: CopilotModels;
  name: Scalars['String']['input'];
}

export interface CreateUserInput {
  email: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
}

export interface CredentialsRequirementType {
  __typename?: 'CredentialsRequirementType';
  password: PasswordLimitsType;
}

export interface DeleteAccount {
  __typename?: 'DeleteAccount';
  success: Scalars['Boolean']['output'];
}

export interface DeleteSessionInput {
  docId: Scalars['String']['input'];
  sessionIds: Array<Scalars['String']['input']>;
  workspaceId: Scalars['String']['input'];
}

export interface DocActionDeniedDataType {
  __typename?: 'DocActionDeniedDataType';
  action: Scalars['String']['output'];
  docId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
}

export interface DocHistoryNotFoundDataType {
  __typename?: 'DocHistoryNotFoundDataType';
  docId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
  timestamp: Scalars['Int']['output'];
}

export interface DocHistoryType {
  __typename?: 'DocHistoryType';
  editor: Maybe<EditorType>;
  id: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  workspaceId: Scalars['String']['output'];
}

/** Doc mode */
export enum DocMode {
  edgeless = 'edgeless',
  page = 'page',
}

export interface DocNotFoundDataType {
  __typename?: 'DocNotFoundDataType';
  docId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
}

export interface DocPermissions {
  __typename?: 'DocPermissions';
  Doc_Copy: Scalars['Boolean']['output'];
  Doc_Delete: Scalars['Boolean']['output'];
  Doc_Duplicate: Scalars['Boolean']['output'];
  Doc_Properties_Read: Scalars['Boolean']['output'];
  Doc_Properties_Update: Scalars['Boolean']['output'];
  Doc_Publish: Scalars['Boolean']['output'];
  Doc_Read: Scalars['Boolean']['output'];
  Doc_Restore: Scalars['Boolean']['output'];
  Doc_TransferOwner: Scalars['Boolean']['output'];
  Doc_Trash: Scalars['Boolean']['output'];
  Doc_Update: Scalars['Boolean']['output'];
  Doc_Users_Manage: Scalars['Boolean']['output'];
  Doc_Users_Read: Scalars['Boolean']['output'];
}

/** User permission in doc */
export enum DocRole {
  Editor = 'Editor',
  External = 'External',
  Manager = 'Manager',
  None = 'None',
  Owner = 'Owner',
  Reader = 'Reader',
}

export interface DocType {
  __typename?: 'DocType';
  defaultRole: DocRole;
  /** paginated doc granted users list */
  grantedUsersList: PaginatedGrantedDocUserType;
  id: Scalars['String']['output'];
  mode: PublicDocMode;
  permissions: DocPermissions;
  public: Scalars['Boolean']['output'];
  workspaceId: Scalars['String']['output'];
}

export interface DocTypeGrantedUsersListArgs {
  pagination: PaginationInput;
}

export interface DocUpdateBlockedDataType {
  __typename?: 'DocUpdateBlockedDataType';
  docId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
}

export interface EditorType {
  __typename?: 'EditorType';
  avatarUrl: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
}

export type ErrorDataUnion =
  | AlreadyInSpaceDataType
  | BlobNotFoundDataType
  | CopilotContextFileNotSupportedDataType
  | CopilotDocNotFoundDataType
  | CopilotFailedToMatchContextDataType
  | CopilotFailedToModifyContextDataType
  | CopilotInvalidContextDataType
  | CopilotMessageNotFoundDataType
  | CopilotPromptNotFoundDataType
  | CopilotProviderSideErrorDataType
  | DocActionDeniedDataType
  | DocHistoryNotFoundDataType
  | DocNotFoundDataType
  | DocUpdateBlockedDataType
  | ExpectToGrantDocUserRolesDataType
  | ExpectToRevokeDocUserRolesDataType
  | ExpectToUpdateDocUserRoleDataType
  | GraphqlBadRequestDataType
  | HttpRequestErrorDataType
  | InvalidEmailDataType
  | InvalidHistoryTimestampDataType
  | InvalidLicenseUpdateParamsDataType
  | InvalidOauthCallbackCodeDataType
  | InvalidPasswordLengthDataType
  | InvalidRuntimeConfigTypeDataType
  | MemberNotFoundInSpaceDataType
  | MentionUserDocAccessDeniedDataType
  | MissingOauthQueryParameterDataType
  | NotInSpaceDataType
  | QueryTooLongDataType
  | RuntimeConfigNotFoundDataType
  | SameSubscriptionRecurringDataType
  | SpaceAccessDeniedDataType
  | SpaceNotFoundDataType
  | SpaceOwnerNotFoundDataType
  | SpaceShouldHaveOnlyOneOwnerDataType
  | SubscriptionAlreadyExistsDataType
  | SubscriptionNotExistsDataType
  | SubscriptionPlanNotFoundDataType
  | UnknownOauthProviderDataType
  | UnsupportedClientVersionDataType
  | UnsupportedSubscriptionPlanDataType
  | ValidationErrorDataType
  | VersionRejectedDataType
  | WorkspaceMembersExceedLimitToDowngradeDataType
  | WorkspacePermissionNotFoundDataType
  | WrongSignInCredentialsDataType;

export enum ErrorNames {
  ACCESS_DENIED = 'ACCESS_DENIED',
  ACTION_FORBIDDEN = 'ACTION_FORBIDDEN',
  ACTION_FORBIDDEN_ON_NON_TEAM_WORKSPACE = 'ACTION_FORBIDDEN_ON_NON_TEAM_WORKSPACE',
  ALREADY_IN_SPACE = 'ALREADY_IN_SPACE',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  BAD_REQUEST = 'BAD_REQUEST',
  BLOB_NOT_FOUND = 'BLOB_NOT_FOUND',
  BLOB_QUOTA_EXCEEDED = 'BLOB_QUOTA_EXCEEDED',
  CANNOT_DELETE_ALL_ADMIN_ACCOUNT = 'CANNOT_DELETE_ALL_ADMIN_ACCOUNT',
  CANNOT_DELETE_OWN_ACCOUNT = 'CANNOT_DELETE_OWN_ACCOUNT',
  CANT_UPDATE_ONETIME_PAYMENT_SUBSCRIPTION = 'CANT_UPDATE_ONETIME_PAYMENT_SUBSCRIPTION',
  CAN_NOT_BATCH_GRANT_DOC_OWNER_PERMISSIONS = 'CAN_NOT_BATCH_GRANT_DOC_OWNER_PERMISSIONS',
  CAN_NOT_REVOKE_YOURSELF = 'CAN_NOT_REVOKE_YOURSELF',
  CAPTCHA_VERIFICATION_FAILED = 'CAPTCHA_VERIFICATION_FAILED',
  COPILOT_ACTION_TAKEN = 'COPILOT_ACTION_TAKEN',
  COPILOT_CONTEXT_FILE_NOT_SUPPORTED = 'COPILOT_CONTEXT_FILE_NOT_SUPPORTED',
  COPILOT_DOC_NOT_FOUND = 'COPILOT_DOC_NOT_FOUND',
  COPILOT_EMBEDDING_UNAVAILABLE = 'COPILOT_EMBEDDING_UNAVAILABLE',
  COPILOT_FAILED_TO_CREATE_MESSAGE = 'COPILOT_FAILED_TO_CREATE_MESSAGE',
  COPILOT_FAILED_TO_GENERATE_TEXT = 'COPILOT_FAILED_TO_GENERATE_TEXT',
  COPILOT_FAILED_TO_MATCH_CONTEXT = 'COPILOT_FAILED_TO_MATCH_CONTEXT',
  COPILOT_FAILED_TO_MODIFY_CONTEXT = 'COPILOT_FAILED_TO_MODIFY_CONTEXT',
  COPILOT_INVALID_CONTEXT = 'COPILOT_INVALID_CONTEXT',
  COPILOT_MESSAGE_NOT_FOUND = 'COPILOT_MESSAGE_NOT_FOUND',
  COPILOT_PROMPT_INVALID = 'COPILOT_PROMPT_INVALID',
  COPILOT_PROMPT_NOT_FOUND = 'COPILOT_PROMPT_NOT_FOUND',
  COPILOT_PROVIDER_SIDE_ERROR = 'COPILOT_PROVIDER_SIDE_ERROR',
  COPILOT_QUOTA_EXCEEDED = 'COPILOT_QUOTA_EXCEEDED',
  COPILOT_SESSION_DELETED = 'COPILOT_SESSION_DELETED',
  COPILOT_SESSION_NOT_FOUND = 'COPILOT_SESSION_NOT_FOUND',
  COPILOT_TRANSCRIPTION_JOB_EXISTS = 'COPILOT_TRANSCRIPTION_JOB_EXISTS',
  CUSTOMER_PORTAL_CREATE_FAILED = 'CUSTOMER_PORTAL_CREATE_FAILED',
  DOC_ACTION_DENIED = 'DOC_ACTION_DENIED',
  DOC_DEFAULT_ROLE_CAN_NOT_BE_OWNER = 'DOC_DEFAULT_ROLE_CAN_NOT_BE_OWNER',
  DOC_HISTORY_NOT_FOUND = 'DOC_HISTORY_NOT_FOUND',
  DOC_IS_NOT_PUBLIC = 'DOC_IS_NOT_PUBLIC',
  DOC_NOT_FOUND = 'DOC_NOT_FOUND',
  DOC_UPDATE_BLOCKED = 'DOC_UPDATE_BLOCKED',
  EARLY_ACCESS_REQUIRED = 'EARLY_ACCESS_REQUIRED',
  EMAIL_ALREADY_USED = 'EMAIL_ALREADY_USED',
  EMAIL_TOKEN_NOT_FOUND = 'EMAIL_TOKEN_NOT_FOUND',
  EMAIL_VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED',
  EXPECT_TO_GRANT_DOC_USER_ROLES = 'EXPECT_TO_GRANT_DOC_USER_ROLES',
  EXPECT_TO_PUBLISH_DOC = 'EXPECT_TO_PUBLISH_DOC',
  EXPECT_TO_REVOKE_DOC_USER_ROLES = 'EXPECT_TO_REVOKE_DOC_USER_ROLES',
  EXPECT_TO_REVOKE_PUBLIC_DOC = 'EXPECT_TO_REVOKE_PUBLIC_DOC',
  EXPECT_TO_UPDATE_DOC_USER_ROLE = 'EXPECT_TO_UPDATE_DOC_USER_ROLE',
  FAILED_TO_CHECKOUT = 'FAILED_TO_CHECKOUT',
  FAILED_TO_SAVE_UPDATES = 'FAILED_TO_SAVE_UPDATES',
  FAILED_TO_UPSERT_SNAPSHOT = 'FAILED_TO_UPSERT_SNAPSHOT',
  GRAPHQL_BAD_REQUEST = 'GRAPHQL_BAD_REQUEST',
  HTTP_REQUEST_ERROR = 'HTTP_REQUEST_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  INVALID_AUTH_STATE = 'INVALID_AUTH_STATE',
  INVALID_CHECKOUT_PARAMETERS = 'INVALID_CHECKOUT_PARAMETERS',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_EMAIL_TOKEN = 'INVALID_EMAIL_TOKEN',
  INVALID_HISTORY_TIMESTAMP = 'INVALID_HISTORY_TIMESTAMP',
  INVALID_LICENSE_SESSION_ID = 'INVALID_LICENSE_SESSION_ID',
  INVALID_LICENSE_TO_ACTIVATE = 'INVALID_LICENSE_TO_ACTIVATE',
  INVALID_LICENSE_UPDATE_PARAMS = 'INVALID_LICENSE_UPDATE_PARAMS',
  INVALID_OAUTH_CALLBACK_CODE = 'INVALID_OAUTH_CALLBACK_CODE',
  INVALID_OAUTH_CALLBACK_STATE = 'INVALID_OAUTH_CALLBACK_STATE',
  INVALID_PASSWORD_LENGTH = 'INVALID_PASSWORD_LENGTH',
  INVALID_RUNTIME_CONFIG_TYPE = 'INVALID_RUNTIME_CONFIG_TYPE',
  INVALID_SUBSCRIPTION_PARAMETERS = 'INVALID_SUBSCRIPTION_PARAMETERS',
  LICENSE_NOT_FOUND = 'LICENSE_NOT_FOUND',
  LICENSE_REVEALED = 'LICENSE_REVEALED',
  LINK_EXPIRED = 'LINK_EXPIRED',
  MAILER_SERVICE_IS_NOT_CONFIGURED = 'MAILER_SERVICE_IS_NOT_CONFIGURED',
  MEMBER_NOT_FOUND_IN_SPACE = 'MEMBER_NOT_FOUND_IN_SPACE',
  MEMBER_QUOTA_EXCEEDED = 'MEMBER_QUOTA_EXCEEDED',
  MENTION_USER_DOC_ACCESS_DENIED = 'MENTION_USER_DOC_ACCESS_DENIED',
  MENTION_USER_ONESELF_DENIED = 'MENTION_USER_ONESELF_DENIED',
  MISSING_OAUTH_QUERY_PARAMETER = 'MISSING_OAUTH_QUERY_PARAMETER',
  NETWORK_ERROR = 'NETWORK_ERROR',
  NOTIFICATION_NOT_FOUND = 'NOTIFICATION_NOT_FOUND',
  NOT_FOUND = 'NOT_FOUND',
  NOT_IN_SPACE = 'NOT_IN_SPACE',
  NO_COPILOT_PROVIDER_AVAILABLE = 'NO_COPILOT_PROVIDER_AVAILABLE',
  OAUTH_ACCOUNT_ALREADY_CONNECTED = 'OAUTH_ACCOUNT_ALREADY_CONNECTED',
  OAUTH_STATE_EXPIRED = 'OAUTH_STATE_EXPIRED',
  OWNER_CAN_NOT_LEAVE_WORKSPACE = 'OWNER_CAN_NOT_LEAVE_WORKSPACE',
  PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
  QUERY_TOO_LONG = 'QUERY_TOO_LONG',
  RUNTIME_CONFIG_NOT_FOUND = 'RUNTIME_CONFIG_NOT_FOUND',
  SAME_EMAIL_PROVIDED = 'SAME_EMAIL_PROVIDED',
  SAME_SUBSCRIPTION_RECURRING = 'SAME_SUBSCRIPTION_RECURRING',
  SIGN_UP_FORBIDDEN = 'SIGN_UP_FORBIDDEN',
  SPACE_ACCESS_DENIED = 'SPACE_ACCESS_DENIED',
  SPACE_NOT_FOUND = 'SPACE_NOT_FOUND',
  SPACE_OWNER_NOT_FOUND = 'SPACE_OWNER_NOT_FOUND',
  SPACE_SHOULD_HAVE_ONLY_ONE_OWNER = 'SPACE_SHOULD_HAVE_ONLY_ONE_OWNER',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  SUBSCRIPTION_ALREADY_EXISTS = 'SUBSCRIPTION_ALREADY_EXISTS',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_HAS_BEEN_CANCELED = 'SUBSCRIPTION_HAS_BEEN_CANCELED',
  SUBSCRIPTION_HAS_NOT_BEEN_CANCELED = 'SUBSCRIPTION_HAS_NOT_BEEN_CANCELED',
  SUBSCRIPTION_NOT_EXISTS = 'SUBSCRIPTION_NOT_EXISTS',
  SUBSCRIPTION_PLAN_NOT_FOUND = 'SUBSCRIPTION_PLAN_NOT_FOUND',
  TOO_MANY_REQUEST = 'TOO_MANY_REQUEST',
  UNKNOWN_OAUTH_PROVIDER = 'UNKNOWN_OAUTH_PROVIDER',
  UNSPLASH_IS_NOT_CONFIGURED = 'UNSPLASH_IS_NOT_CONFIGURED',
  UNSUPPORTED_CLIENT_VERSION = 'UNSUPPORTED_CLIENT_VERSION',
  UNSUPPORTED_SUBSCRIPTION_PLAN = 'UNSUPPORTED_SUBSCRIPTION_PLAN',
  USER_AVATAR_NOT_FOUND = 'USER_AVATAR_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  VERSION_REJECTED = 'VERSION_REJECTED',
  WORKSPACE_ID_REQUIRED_FOR_TEAM_SUBSCRIPTION = 'WORKSPACE_ID_REQUIRED_FOR_TEAM_SUBSCRIPTION',
  WORKSPACE_ID_REQUIRED_TO_UPDATE_TEAM_SUBSCRIPTION = 'WORKSPACE_ID_REQUIRED_TO_UPDATE_TEAM_SUBSCRIPTION',
  WORKSPACE_LICENSE_ALREADY_EXISTS = 'WORKSPACE_LICENSE_ALREADY_EXISTS',
  WORKSPACE_MEMBERS_EXCEED_LIMIT_TO_DOWNGRADE = 'WORKSPACE_MEMBERS_EXCEED_LIMIT_TO_DOWNGRADE',
  WORKSPACE_PERMISSION_NOT_FOUND = 'WORKSPACE_PERMISSION_NOT_FOUND',
  WRONG_SIGN_IN_CREDENTIALS = 'WRONG_SIGN_IN_CREDENTIALS',
  WRONG_SIGN_IN_METHOD = 'WRONG_SIGN_IN_METHOD',
}

export interface ExpectToGrantDocUserRolesDataType {
  __typename?: 'ExpectToGrantDocUserRolesDataType';
  docId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
}

export interface ExpectToRevokeDocUserRolesDataType {
  __typename?: 'ExpectToRevokeDocUserRolesDataType';
  docId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
}

export interface ExpectToUpdateDocUserRoleDataType {
  __typename?: 'ExpectToUpdateDocUserRoleDataType';
  docId: Scalars['String']['output'];
  spaceId: Scalars['String']['output'];
}

export enum FeatureType {
  AIEarlyAccess = 'AIEarlyAccess',
  Admin = 'Admin',
  EarlyAccess = 'EarlyAccess',
  FreePlan = 'FreePlan',
  LifetimeProPlan = 'LifetimeProPlan',
  ProPlan = 'ProPlan',
  TeamPlan = 'TeamPlan',
  UnlimitedCopilot = 'UnlimitedCopilot',
  UnlimitedWorkspace = 'UnlimitedWorkspace',
}

export interface ForkChatSessionInput {
  docId: Scalars['String']['input'];
  /** Identify a message in the array and keep it with all previous messages into a forked session. */
  latestMessageId: Scalars['String']['input'];
  sessionId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface GrantDocUserRolesInput {
  docId: Scalars['String']['input'];
  role: DocRole;
  userIds: Array<Scalars['String']['input']>;
  workspaceId: Scalars['String']['input'];
}

export interface GrantedDocUserType {
  __typename?: 'GrantedDocUserType';
  role: DocRole;
  user: WorkspaceUserType;
}

export interface GrantedDocUserTypeEdge {
  __typename?: 'GrantedDocUserTypeEdge';
  cursor: Scalars['String']['output'];
  node: GrantedDocUserType;
}

export interface GraphqlBadRequestDataType {
  __typename?: 'GraphqlBadRequestDataType';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
}

export interface HttpRequestErrorDataType {
  __typename?: 'HttpRequestErrorDataType';
  message: Scalars['String']['output'];
}

export interface ImportUsersInput {
  users: Array<CreateUserInput>;
}

export interface InvalidEmailDataType {
  __typename?: 'InvalidEmailDataType';
  email: Scalars['String']['output'];
}

export interface InvalidHistoryTimestampDataType {
  __typename?: 'InvalidHistoryTimestampDataType';
  timestamp: Scalars['String']['output'];
}

export interface InvalidLicenseUpdateParamsDataType {
  __typename?: 'InvalidLicenseUpdateParamsDataType';
  reason: Scalars['String']['output'];
}

export interface InvalidOauthCallbackCodeDataType {
  __typename?: 'InvalidOauthCallbackCodeDataType';
  body: Scalars['String']['output'];
  status: Scalars['Int']['output'];
}

export interface InvalidPasswordLengthDataType {
  __typename?: 'InvalidPasswordLengthDataType';
  max: Scalars['Int']['output'];
  min: Scalars['Int']['output'];
}

export interface InvalidRuntimeConfigTypeDataType {
  __typename?: 'InvalidRuntimeConfigTypeDataType';
  get: Scalars['String']['output'];
  key: Scalars['String']['output'];
  want: Scalars['String']['output'];
}

export interface InvitationAcceptedNotificationBodyType {
  __typename?: 'InvitationAcceptedNotificationBodyType';
  /** The user who created the notification, maybe null when user is deleted or sent by system */
  createdByUser: Maybe<PublicUserType>;
  inviteId: Scalars['String']['output'];
  /** The type of the notification */
  type: NotificationType;
  workspace: Maybe<NotificationWorkspaceType>;
}

export interface InvitationBlockedNotificationBodyType {
  __typename?: 'InvitationBlockedNotificationBodyType';
  /** The user who created the notification, maybe null when user is deleted or sent by system */
  createdByUser: Maybe<PublicUserType>;
  inviteId: Scalars['String']['output'];
  /** The type of the notification */
  type: NotificationType;
  workspace: Maybe<NotificationWorkspaceType>;
}

export interface InvitationNotificationBodyType {
  __typename?: 'InvitationNotificationBodyType';
  /** The user who created the notification, maybe null when user is deleted or sent by system */
  createdByUser: Maybe<PublicUserType>;
  inviteId: Scalars['ID']['output'];
  /** The type of the notification */
  type: NotificationType;
  workspace: Maybe<NotificationWorkspaceType>;
}

export interface InvitationType {
  __typename?: 'InvitationType';
  /** Invitee information */
  invitee: UserType;
  /** User information */
  user: UserType;
  /** Workspace information */
  workspace: InvitationWorkspaceType;
}

export interface InvitationWorkspaceType {
  __typename?: 'InvitationWorkspaceType';
  /** Base64 encoded avatar */
  avatar: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** Workspace name */
  name: Scalars['String']['output'];
}

export interface InviteLink {
  __typename?: 'InviteLink';
  /** Invite link expire time */
  expireTime: Scalars['DateTime']['output'];
  /** Invite link */
  link: Scalars['String']['output'];
}

export interface InviteResult {
  __typename?: 'InviteResult';
  email: Scalars['String']['output'];
  /** Invite id, null if invite record create failed */
  inviteId: Maybe<Scalars['String']['output']>;
  /** Invite email sent success */
  sentSuccess: Scalars['Boolean']['output'];
}

export interface InviteUserType {
  __typename?: 'InviteUserType';
  /**
   * User accepted
   * @deprecated Use `status` instead
   */
  accepted: Scalars['Boolean']['output'];
  /** User avatar url */
  avatarUrl: Maybe<Scalars['String']['output']>;
  /**
   * User email verified
   * @deprecated useless
   */
  createdAt: Maybe<Scalars['DateTime']['output']>;
  /** User is disabled */
  disabled: Maybe<Scalars['Boolean']['output']>;
  /** User email */
  email: Maybe<Scalars['String']['output']>;
  /** User email verified */
  emailVerified: Maybe<Scalars['Boolean']['output']>;
  /** User password has been set */
  hasPassword: Maybe<Scalars['Boolean']['output']>;
  id: Scalars['ID']['output'];
  /** Invite id */
  inviteId: Scalars['String']['output'];
  /** User name */
  name: Maybe<Scalars['String']['output']>;
  /**
   * User permission in workspace
   * @deprecated Use role instead
   */
  permission: Permission;
  /** User role in workspace */
  role: Permission;
  /** Member invite status in workspace */
  status: WorkspaceMemberStatus;
}

export enum InvoiceStatus {
  Draft = 'Draft',
  Open = 'Open',
  Paid = 'Paid',
  Uncollectible = 'Uncollectible',
  Void = 'Void',
}

export interface InvoiceType {
  __typename?: 'InvoiceType';
  amount: Scalars['Int']['output'];
  createdAt: Scalars['DateTime']['output'];
  currency: Scalars['String']['output'];
  /** @deprecated removed */
  id: Maybe<Scalars['String']['output']>;
  lastPaymentError: Maybe<Scalars['String']['output']>;
  link: Maybe<Scalars['String']['output']>;
  /** @deprecated removed */
  plan: Maybe<SubscriptionPlan>;
  reason: Scalars['String']['output'];
  /** @deprecated removed */
  recurring: Maybe<SubscriptionRecurring>;
  status: InvoiceStatus;
  updatedAt: Scalars['DateTime']['output'];
}

export interface License {
  __typename?: 'License';
  expiredAt: Maybe<Scalars['DateTime']['output']>;
  installedAt: Scalars['DateTime']['output'];
  quantity: Scalars['Int']['output'];
  recurring: SubscriptionRecurring;
  validatedAt: Scalars['DateTime']['output'];
}

export interface LimitedUserType {
  __typename?: 'LimitedUserType';
  /** User email */
  email: Scalars['String']['output'];
  /** User password has been set */
  hasPassword: Maybe<Scalars['Boolean']['output']>;
}

export interface ListUserInput {
  first?: InputMaybe<Scalars['Int']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
}

export interface ListedBlob {
  __typename?: 'ListedBlob';
  createdAt: Scalars['String']['output'];
  key: Scalars['String']['output'];
  mime: Scalars['String']['output'];
  size: Scalars['Int']['output'];
}

export interface ManageUserInput {
  /** User email */
  email?: InputMaybe<Scalars['String']['input']>;
  /** User name */
  name?: InputMaybe<Scalars['String']['input']>;
}

export interface MemberNotFoundInSpaceDataType {
  __typename?: 'MemberNotFoundInSpaceDataType';
  spaceId: Scalars['String']['output'];
}

export interface MentionDocInput {
  /** The block id in the doc */
  blockId?: InputMaybe<Scalars['String']['input']>;
  /** The element id in the doc */
  elementId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  mode: DocMode;
  title: Scalars['String']['input'];
}

export interface MentionDocType {
  __typename?: 'MentionDocType';
  blockId: Maybe<Scalars['String']['output']>;
  elementId: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  mode: DocMode;
  title: Scalars['String']['output'];
}

export interface MentionInput {
  doc: MentionDocInput;
  userId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MentionNotificationBodyType {
  __typename?: 'MentionNotificationBodyType';
  /** The user who created the notification, maybe null when user is deleted or sent by system */
  createdByUser: Maybe<PublicUserType>;
  doc: MentionDocType;
  /** The type of the notification */
  type: NotificationType;
  workspace: Maybe<NotificationWorkspaceType>;
}

export interface MentionUserDocAccessDeniedDataType {
  __typename?: 'MentionUserDocAccessDeniedDataType';
  docId: Scalars['String']['output'];
}

export interface MissingOauthQueryParameterDataType {
  __typename?: 'MissingOauthQueryParameterDataType';
  name: Scalars['String']['output'];
}

export interface Mutation {
  __typename?: 'Mutation';
  acceptInviteById: Scalars['Boolean']['output'];
  activateLicense: License;
  /** add a category to context */
  addContextCategory: CopilotContextCategory;
  /** add a doc to context */
  addContextDoc: CopilotContextDoc;
  /** add a file to context */
  addContextFile: CopilotContextFile;
  addWorkspaceFeature: Scalars['Boolean']['output'];
  approveMember: Scalars['Boolean']['output'];
  /** Ban an user */
  banUser: UserType;
  cancelSubscription: SubscriptionType;
  changeEmail: UserType;
  changePassword: Scalars['Boolean']['output'];
  claimAudioTranscription: Maybe<TranscriptionResultType>;
  /** Cleanup sessions */
  cleanupCopilotSession: Array<Scalars['String']['output']>;
  /** Create change password url */
  createChangePasswordUrl: Scalars['String']['output'];
  /** Create a subscription checkout link of stripe */
  createCheckoutSession: Scalars['String']['output'];
  /** Create a context session */
  createCopilotContext: Scalars['String']['output'];
  /** Create a chat message */
  createCopilotMessage: Scalars['String']['output'];
  /** Create a copilot prompt */
  createCopilotPrompt: CopilotPromptType;
  /** Create a chat session */
  createCopilotSession: Scalars['String']['output'];
  /** Create a stripe customer portal to manage payment methods */
  createCustomerPortal: Scalars['String']['output'];
  createInviteLink: InviteLink;
  createSelfhostWorkspaceCustomerPortal: Scalars['String']['output'];
  /** Create a new user */
  createUser: UserType;
  /** Create a new workspace */
  createWorkspace: WorkspaceType;
  deactivateLicense: Scalars['Boolean']['output'];
  deleteAccount: DeleteAccount;
  deleteBlob: Scalars['Boolean']['output'];
  /** Delete a user account */
  deleteUser: DeleteAccount;
  deleteWorkspace: Scalars['Boolean']['output'];
  /** Reenable an banned user */
  enableUser: UserType;
  /** Create a chat session */
  forkCopilotSession: Scalars['String']['output'];
  generateLicenseKey: Scalars['String']['output'];
  grantDocUserRoles: Scalars['Boolean']['output'];
  grantMember: Scalars['Boolean']['output'];
  /** import users */
  importUsers: Array<UserImportResultType>;
  invite: Scalars['String']['output'];
  inviteBatch: Array<InviteResult>;
  leaveWorkspace: Scalars['Boolean']['output'];
  /** mention user in a doc */
  mentionUser: Scalars['ID']['output'];
  publishDoc: DocType;
  /** @deprecated use publishDoc instead */
  publishPage: DocType;
  /** queue workspace doc embedding */
  queueWorkspaceEmbedding: Scalars['Boolean']['output'];
  /** mark notification as read */
  readNotification: Scalars['Boolean']['output'];
  recoverDoc: Scalars['DateTime']['output'];
  releaseDeletedBlobs: Scalars['Boolean']['output'];
  /** Remove user avatar */
  removeAvatar: RemoveAvatar;
  /** remove a category from context */
  removeContextCategory: Scalars['Boolean']['output'];
  /** remove a doc from context */
  removeContextDoc: Scalars['Boolean']['output'];
  /** remove a file from context */
  removeContextFile: Scalars['Boolean']['output'];
  removeWorkspaceFeature: Scalars['Boolean']['output'];
  resumeSubscription: SubscriptionType;
  revoke: Scalars['Boolean']['output'];
  revokeDocUserRoles: Scalars['Boolean']['output'];
  revokeInviteLink: Scalars['Boolean']['output'];
  revokePublicDoc: DocType;
  /** @deprecated use revokePublicDoc instead */
  revokePublicPage: DocType;
  sendChangeEmail: Scalars['Boolean']['output'];
  sendChangePasswordEmail: Scalars['Boolean']['output'];
  sendSetPasswordEmail: Scalars['Boolean']['output'];
  sendVerifyChangeEmail: Scalars['Boolean']['output'];
  sendVerifyEmail: Scalars['Boolean']['output'];
  setBlob: Scalars['String']['output'];
  submitAudioTranscription: Maybe<TranscriptionResultType>;
  /** Update a copilot prompt */
  updateCopilotPrompt: CopilotPromptType;
  /** Update a chat session */
  updateCopilotSession: Scalars['String']['output'];
  updateDocDefaultRole: Scalars['Boolean']['output'];
  updateDocUserRole: Scalars['Boolean']['output'];
  updateProfile: UserType;
  /** update server runtime configurable setting */
  updateRuntimeConfig: ServerRuntimeConfigType;
  /** update multiple server runtime configurable settings */
  updateRuntimeConfigs: Array<ServerRuntimeConfigType>;
  /** Update user settings */
  updateSettings: Scalars['Boolean']['output'];
  updateSubscriptionRecurring: SubscriptionType;
  /** Update an user */
  updateUser: UserType;
  /** update user enabled feature */
  updateUserFeatures: Array<FeatureType>;
  /** Update workspace */
  updateWorkspace: WorkspaceType;
  /** Upload user avatar */
  uploadAvatar: UserType;
  verifyEmail: Scalars['Boolean']['output'];
}

export interface MutationAcceptInviteByIdArgs {
  inviteId: Scalars['String']['input'];
  sendAcceptMail?: InputMaybe<Scalars['Boolean']['input']>;
  workspaceId: Scalars['String']['input'];
}

export interface MutationActivateLicenseArgs {
  license: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationAddContextCategoryArgs {
  options: AddRemoveContextCategoryInput;
}

export interface MutationAddContextDocArgs {
  options: AddContextDocInput;
}

export interface MutationAddContextFileArgs {
  content: Scalars['Upload']['input'];
  options: AddContextFileInput;
}

export interface MutationAddWorkspaceFeatureArgs {
  feature: FeatureType;
  workspaceId: Scalars['String']['input'];
}

export interface MutationApproveMemberArgs {
  userId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationBanUserArgs {
  id: Scalars['String']['input'];
}

export interface MutationCancelSubscriptionArgs {
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  plan?: InputMaybe<SubscriptionPlan>;
  workspaceId?: InputMaybe<Scalars['String']['input']>;
}

export interface MutationChangeEmailArgs {
  email: Scalars['String']['input'];
  token: Scalars['String']['input'];
}

export interface MutationChangePasswordArgs {
  newPassword: Scalars['String']['input'];
  token: Scalars['String']['input'];
  userId?: InputMaybe<Scalars['String']['input']>;
}

export interface MutationClaimAudioTranscriptionArgs {
  jobId: Scalars['String']['input'];
}

export interface MutationCleanupCopilotSessionArgs {
  options: DeleteSessionInput;
}

export interface MutationCreateChangePasswordUrlArgs {
  callbackUrl: Scalars['String']['input'];
  userId: Scalars['String']['input'];
}

export interface MutationCreateCheckoutSessionArgs {
  input: CreateCheckoutSessionInput;
}

export interface MutationCreateCopilotContextArgs {
  sessionId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationCreateCopilotMessageArgs {
  options: CreateChatMessageInput;
}

export interface MutationCreateCopilotPromptArgs {
  input: CreateCopilotPromptInput;
}

export interface MutationCreateCopilotSessionArgs {
  options: CreateChatSessionInput;
}

export interface MutationCreateInviteLinkArgs {
  expireTime: WorkspaceInviteLinkExpireTime;
  workspaceId: Scalars['String']['input'];
}

export interface MutationCreateSelfhostWorkspaceCustomerPortalArgs {
  workspaceId: Scalars['String']['input'];
}

export interface MutationCreateUserArgs {
  input: CreateUserInput;
}

export interface MutationCreateWorkspaceArgs {
  init?: InputMaybe<Scalars['Upload']['input']>;
}

export interface MutationDeactivateLicenseArgs {
  workspaceId: Scalars['String']['input'];
}

export interface MutationDeleteBlobArgs {
  hash?: InputMaybe<Scalars['String']['input']>;
  key?: InputMaybe<Scalars['String']['input']>;
  permanently?: Scalars['Boolean']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationDeleteUserArgs {
  id: Scalars['String']['input'];
}

export interface MutationDeleteWorkspaceArgs {
  id: Scalars['String']['input'];
}

export interface MutationEnableUserArgs {
  id: Scalars['String']['input'];
}

export interface MutationForkCopilotSessionArgs {
  options: ForkChatSessionInput;
}

export interface MutationGenerateLicenseKeyArgs {
  sessionId: Scalars['String']['input'];
}

export interface MutationGrantDocUserRolesArgs {
  input: GrantDocUserRolesInput;
}

export interface MutationGrantMemberArgs {
  permission: Permission;
  userId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationImportUsersArgs {
  input: ImportUsersInput;
}

export interface MutationInviteArgs {
  email: Scalars['String']['input'];
  permission?: InputMaybe<Permission>;
  sendInviteMail?: InputMaybe<Scalars['Boolean']['input']>;
  workspaceId: Scalars['String']['input'];
}

export interface MutationInviteBatchArgs {
  emails: Array<Scalars['String']['input']>;
  sendInviteMail?: InputMaybe<Scalars['Boolean']['input']>;
  workspaceId: Scalars['String']['input'];
}

export interface MutationLeaveWorkspaceArgs {
  sendLeaveMail?: InputMaybe<Scalars['Boolean']['input']>;
  workspaceId: Scalars['String']['input'];
  workspaceName?: InputMaybe<Scalars['String']['input']>;
}

export interface MutationMentionUserArgs {
  input: MentionInput;
}

export interface MutationPublishDocArgs {
  docId: Scalars['String']['input'];
  mode?: InputMaybe<PublicDocMode>;
  workspaceId: Scalars['String']['input'];
}

export interface MutationPublishPageArgs {
  mode?: InputMaybe<PublicDocMode>;
  pageId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationQueueWorkspaceEmbeddingArgs {
  docId: Array<Scalars['String']['input']>;
  workspaceId: Scalars['String']['input'];
}

export interface MutationReadNotificationArgs {
  id: Scalars['String']['input'];
}

export interface MutationRecoverDocArgs {
  guid: Scalars['String']['input'];
  timestamp: Scalars['DateTime']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationReleaseDeletedBlobsArgs {
  workspaceId: Scalars['String']['input'];
}

export interface MutationRemoveContextCategoryArgs {
  options: AddRemoveContextCategoryInput;
}

export interface MutationRemoveContextDocArgs {
  options: RemoveContextDocInput;
}

export interface MutationRemoveContextFileArgs {
  options: RemoveContextFileInput;
}

export interface MutationRemoveWorkspaceFeatureArgs {
  feature: FeatureType;
  workspaceId: Scalars['String']['input'];
}

export interface MutationResumeSubscriptionArgs {
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  plan?: InputMaybe<SubscriptionPlan>;
  workspaceId?: InputMaybe<Scalars['String']['input']>;
}

export interface MutationRevokeArgs {
  userId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationRevokeDocUserRolesArgs {
  input: RevokeDocUserRoleInput;
}

export interface MutationRevokeInviteLinkArgs {
  workspaceId: Scalars['String']['input'];
}

export interface MutationRevokePublicDocArgs {
  docId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationRevokePublicPageArgs {
  docId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationSendChangeEmailArgs {
  callbackUrl: Scalars['String']['input'];
  email?: InputMaybe<Scalars['String']['input']>;
}

export interface MutationSendChangePasswordEmailArgs {
  callbackUrl: Scalars['String']['input'];
  email?: InputMaybe<Scalars['String']['input']>;
}

export interface MutationSendSetPasswordEmailArgs {
  callbackUrl: Scalars['String']['input'];
  email?: InputMaybe<Scalars['String']['input']>;
}

export interface MutationSendVerifyChangeEmailArgs {
  callbackUrl: Scalars['String']['input'];
  email: Scalars['String']['input'];
  token: Scalars['String']['input'];
}

export interface MutationSendVerifyEmailArgs {
  callbackUrl: Scalars['String']['input'];
}

export interface MutationSetBlobArgs {
  blob: Scalars['Upload']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationSubmitAudioTranscriptionArgs {
  blob: Scalars['Upload']['input'];
  blobId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationUpdateCopilotPromptArgs {
  messages: Array<CopilotPromptMessageInput>;
  name: Scalars['String']['input'];
}

export interface MutationUpdateCopilotSessionArgs {
  options: UpdateChatSessionInput;
}

export interface MutationUpdateDocDefaultRoleArgs {
  input: UpdateDocDefaultRoleInput;
}

export interface MutationUpdateDocUserRoleArgs {
  input: UpdateDocUserRoleInput;
}

export interface MutationUpdateProfileArgs {
  input: UpdateUserInput;
}

export interface MutationUpdateRuntimeConfigArgs {
  id: Scalars['String']['input'];
  value: Scalars['JSON']['input'];
}

export interface MutationUpdateRuntimeConfigsArgs {
  updates: Scalars['JSONObject']['input'];
}

export interface MutationUpdateSettingsArgs {
  input: UpdateSettingsInput;
}

export interface MutationUpdateSubscriptionRecurringArgs {
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  plan?: InputMaybe<SubscriptionPlan>;
  recurring: SubscriptionRecurring;
  workspaceId?: InputMaybe<Scalars['String']['input']>;
}

export interface MutationUpdateUserArgs {
  id: Scalars['String']['input'];
  input: ManageUserInput;
}

export interface MutationUpdateUserFeaturesArgs {
  features: Array<FeatureType>;
  id: Scalars['String']['input'];
}

export interface MutationUpdateWorkspaceArgs {
  input: UpdateWorkspaceInput;
}

export interface MutationUploadAvatarArgs {
  avatar: Scalars['Upload']['input'];
}

export interface MutationVerifyEmailArgs {
  token: Scalars['String']['input'];
}

export interface NotInSpaceDataType {
  __typename?: 'NotInSpaceDataType';
  spaceId: Scalars['String']['output'];
}

/** Notification level */
export enum NotificationLevel {
  Default = 'Default',
  High = 'High',
  Low = 'Low',
  Min = 'Min',
  None = 'None',
}

export interface NotificationObjectType {
  __typename?: 'NotificationObjectType';
  /** Just a placeholder to export UnionNotificationBodyType, don't use it */
  _placeholderForUnionNotificationBodyType: UnionNotificationBodyType;
  /** The body of the notification, different types have different fields, see UnionNotificationBodyType */
  body: Scalars['JSONObject']['output'];
  /** The created at time of the notification */
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  /** The level of the notification */
  level: NotificationLevel;
  /** Whether the notification has been read */
  read: Scalars['Boolean']['output'];
  /** The type of the notification */
  type: NotificationType;
  /** The updated at time of the notification */
  updatedAt: Scalars['DateTime']['output'];
}

export interface NotificationObjectTypeEdge {
  __typename?: 'NotificationObjectTypeEdge';
  cursor: Scalars['String']['output'];
  node: NotificationObjectType;
}

/** Notification type */
export enum NotificationType {
  Invitation = 'Invitation',
  InvitationAccepted = 'InvitationAccepted',
  InvitationBlocked = 'InvitationBlocked',
  InvitationRejected = 'InvitationRejected',
  Mention = 'Mention',
}

export interface NotificationWorkspaceType {
  __typename?: 'NotificationWorkspaceType';
  /** Workspace avatar url */
  avatarUrl: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Workspace name */
  name: Scalars['String']['output'];
}

export enum OAuthProviderType {
  GitHub = 'GitHub',
  Google = 'Google',
  OIDC = 'OIDC',
}

export interface PageInfo {
  __typename?: 'PageInfo';
  endCursor: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor: Maybe<Scalars['String']['output']>;
}

export interface PaginatedGrantedDocUserType {
  __typename?: 'PaginatedGrantedDocUserType';
  edges: Array<GrantedDocUserTypeEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
}

export interface PaginatedNotificationObjectType {
  __typename?: 'PaginatedNotificationObjectType';
  edges: Array<NotificationObjectTypeEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
}

export interface PaginationInput {
  /** returns the elements in the list that come after the specified cursor. */
  after?: InputMaybe<Scalars['String']['input']>;
  /** returns the first n elements from the list. */
  first?: InputMaybe<Scalars['Int']['input']>;
  /** ignore the first n elements from the list. */
  offset?: InputMaybe<Scalars['Int']['input']>;
}

export interface PasswordLimitsType {
  __typename?: 'PasswordLimitsType';
  maxLength: Scalars['Int']['output'];
  minLength: Scalars['Int']['output'];
}

/** User permission in workspace */
export enum Permission {
  Admin = 'Admin',
  Collaborator = 'Collaborator',
  External = 'External',
  Owner = 'Owner',
}

/** The mode which the public doc default in */
export enum PublicDocMode {
  Edgeless = 'Edgeless',
  Page = 'Page',
}

export interface PublicUserType {
  __typename?: 'PublicUserType';
  avatarUrl: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
}

export interface Query {
  __typename?: 'Query';
  /** @deprecated use `user.quotaUsage` instead */
  collectAllBlobSizes: WorkspaceBlobSizes;
  /** Get current user */
  currentUser: Maybe<UserType>;
  error: ErrorDataUnion;
  /** send workspace invitation */
  getInviteInfo: InvitationType;
  /**
   * Get is admin of workspace
   * @deprecated use WorkspaceType[role] instead
   */
  isAdmin: Scalars['Boolean']['output'];
  /**
   * Get is owner of workspace
   * @deprecated use WorkspaceType[role] instead
   */
  isOwner: Scalars['Boolean']['output'];
  /** List all copilot prompts */
  listCopilotPrompts: Array<CopilotPromptType>;
  prices: Array<SubscriptionPrice>;
  /** Get public user by id */
  publicUserById: Maybe<PublicUserType>;
  /** query workspace embedding status */
  queryWorkspaceEmbeddingStatus: ContextWorkspaceEmbeddingStatus;
  /** server config */
  serverConfig: ServerConfigType;
  /** get all server runtime configurable settings */
  serverRuntimeConfig: Array<ServerRuntimeConfigType>;
  serverServiceConfigs: Array<ServerServiceConfig>;
  /** Get user by email */
  user: Maybe<UserOrLimitedUser>;
  /** Get user by email for admin */
  userByEmail: Maybe<UserType>;
  /** Get user by id */
  userById: UserType;
  /** List registered users */
  users: Array<UserType>;
  /** Get users count */
  usersCount: Scalars['Int']['output'];
  /** Get workspace by id */
  workspace: WorkspaceType;
  /**
   * Get workspace role permissions
   * @deprecated use WorkspaceType[permissions] instead
   */
  workspaceRolePermissions: WorkspaceRolePermissions;
  /** Get all accessible workspaces for current user */
  workspaces: Array<WorkspaceType>;
}

export interface QueryErrorArgs {
  name: ErrorNames;
}

export interface QueryGetInviteInfoArgs {
  inviteId: Scalars['String']['input'];
}

export interface QueryIsAdminArgs {
  workspaceId: Scalars['String']['input'];
}

export interface QueryIsOwnerArgs {
  workspaceId: Scalars['String']['input'];
}

export interface QueryPublicUserByIdArgs {
  id: Scalars['String']['input'];
}

export interface QueryQueryWorkspaceEmbeddingStatusArgs {
  workspaceId: Scalars['String']['input'];
}

export interface QueryUserArgs {
  email: Scalars['String']['input'];
}

export interface QueryUserByEmailArgs {
  email: Scalars['String']['input'];
}

export interface QueryUserByIdArgs {
  id: Scalars['String']['input'];
}

export interface QueryUsersArgs {
  filter: ListUserInput;
}

export interface QueryWorkspaceArgs {
  id: Scalars['String']['input'];
}

export interface QueryWorkspaceRolePermissionsArgs {
  id: Scalars['String']['input'];
}

export interface QueryChatHistoriesInput {
  action?: InputMaybe<Scalars['Boolean']['input']>;
  fork?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  messageOrder?: InputMaybe<ChatHistoryOrder>;
  sessionId?: InputMaybe<Scalars['String']['input']>;
  sessionOrder?: InputMaybe<ChatHistoryOrder>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  withPrompt?: InputMaybe<Scalars['Boolean']['input']>;
}

export interface QueryChatSessionsInput {
  action?: InputMaybe<Scalars['Boolean']['input']>;
}

export interface QueryTooLongDataType {
  __typename?: 'QueryTooLongDataType';
  max: Scalars['Int']['output'];
}

export interface ReleaseVersionType {
  __typename?: 'ReleaseVersionType';
  changelog: Scalars['String']['output'];
  publishedAt: Scalars['DateTime']['output'];
  url: Scalars['String']['output'];
  version: Scalars['String']['output'];
}

export interface RemoveAvatar {
  __typename?: 'RemoveAvatar';
  success: Scalars['Boolean']['output'];
}

export interface RemoveContextDocInput {
  contextId: Scalars['String']['input'];
  docId: Scalars['String']['input'];
}

export interface RemoveContextFileInput {
  contextId: Scalars['String']['input'];
  fileId: Scalars['String']['input'];
}

export interface RevokeDocUserRoleInput {
  docId: Scalars['String']['input'];
  userId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface RuntimeConfigNotFoundDataType {
  __typename?: 'RuntimeConfigNotFoundDataType';
  key: Scalars['String']['output'];
}

export enum RuntimeConfigType {
  Array = 'Array',
  Boolean = 'Boolean',
  Number = 'Number',
  Object = 'Object',
  String = 'String',
}

export interface SameSubscriptionRecurringDataType {
  __typename?: 'SameSubscriptionRecurringDataType';
  recurring: Scalars['String']['output'];
}

export interface ServerConfigType {
  __typename?: 'ServerConfigType';
  /** fetch latest available upgradable release of server */
  availableUpgrade: ReleaseVersionType;
  /** Features for user that can be configured */
  availableUserFeatures: Array<FeatureType>;
  /** server base url */
  baseUrl: Scalars['String']['output'];
  /** credentials requirement */
  credentialsRequirement: CredentialsRequirementType;
  /** enable telemetry */
  enableTelemetry: Scalars['Boolean']['output'];
  /** enabled server features */
  features: Array<ServerFeature>;
  /** server flags */
  flags: ServerFlagsType;
  /**
   * server flavor
   * @deprecated use `features`
   */
  flavor: Scalars['String']['output'];
  /** whether server has been initialized */
  initialized: Scalars['Boolean']['output'];
  /** server identical name could be shown as badge on user interface */
  name: Scalars['String']['output'];
  oauthProviders: Array<OAuthProviderType>;
  /** server type */
  type: ServerDeploymentType;
  /** server version */
  version: Scalars['String']['output'];
}

export enum ServerDeploymentType {
  Affine = 'Affine',
  Selfhosted = 'Selfhosted',
}

export enum ServerFeature {
  Captcha = 'Captcha',
  Copilot = 'Copilot',
  OAuth = 'OAuth',
  Payment = 'Payment',
}

export interface ServerFlagsType {
  __typename?: 'ServerFlagsType';
  earlyAccessControl: Scalars['Boolean']['output'];
  syncClientVersionCheck: Scalars['Boolean']['output'];
}

export interface ServerRuntimeConfigType {
  __typename?: 'ServerRuntimeConfigType';
  description: Scalars['String']['output'];
  id: Scalars['String']['output'];
  key: Scalars['String']['output'];
  module: Scalars['String']['output'];
  type: RuntimeConfigType;
  updatedAt: Scalars['DateTime']['output'];
  value: Scalars['JSON']['output'];
}

export interface ServerServiceConfig {
  __typename?: 'ServerServiceConfig';
  config: Scalars['JSONObject']['output'];
  name: Scalars['String']['output'];
}

export interface SettingsType {
  __typename?: 'SettingsType';
  /** Receive invitation email */
  receiveInvitationEmail: Scalars['Boolean']['output'];
  /** Receive mention email */
  receiveMentionEmail: Scalars['Boolean']['output'];
}

export interface SpaceAccessDeniedDataType {
  __typename?: 'SpaceAccessDeniedDataType';
  spaceId: Scalars['String']['output'];
}

export interface SpaceNotFoundDataType {
  __typename?: 'SpaceNotFoundDataType';
  spaceId: Scalars['String']['output'];
}

export interface SpaceOwnerNotFoundDataType {
  __typename?: 'SpaceOwnerNotFoundDataType';
  spaceId: Scalars['String']['output'];
}

export interface SpaceShouldHaveOnlyOneOwnerDataType {
  __typename?: 'SpaceShouldHaveOnlyOneOwnerDataType';
  spaceId: Scalars['String']['output'];
}

export interface SubscriptionAlreadyExistsDataType {
  __typename?: 'SubscriptionAlreadyExistsDataType';
  plan: Scalars['String']['output'];
}

export interface SubscriptionNotExistsDataType {
  __typename?: 'SubscriptionNotExistsDataType';
  plan: Scalars['String']['output'];
}

export enum SubscriptionPlan {
  AI = 'AI',
  Enterprise = 'Enterprise',
  Free = 'Free',
  Pro = 'Pro',
  SelfHosted = 'SelfHosted',
  SelfHostedTeam = 'SelfHostedTeam',
  Team = 'Team',
}

export interface SubscriptionPlanNotFoundDataType {
  __typename?: 'SubscriptionPlanNotFoundDataType';
  plan: Scalars['String']['output'];
  recurring: Scalars['String']['output'];
}

export interface SubscriptionPrice {
  __typename?: 'SubscriptionPrice';
  amount: Maybe<Scalars['Int']['output']>;
  currency: Scalars['String']['output'];
  lifetimeAmount: Maybe<Scalars['Int']['output']>;
  plan: SubscriptionPlan;
  type: Scalars['String']['output'];
  yearlyAmount: Maybe<Scalars['Int']['output']>;
}

export enum SubscriptionRecurring {
  Lifetime = 'Lifetime',
  Monthly = 'Monthly',
  Yearly = 'Yearly',
}

export enum SubscriptionStatus {
  Active = 'Active',
  Canceled = 'Canceled',
  Incomplete = 'Incomplete',
  IncompleteExpired = 'IncompleteExpired',
  PastDue = 'PastDue',
  Paused = 'Paused',
  Trialing = 'Trialing',
  Unpaid = 'Unpaid',
}

export interface SubscriptionType {
  __typename?: 'SubscriptionType';
  canceledAt: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  end: Maybe<Scalars['DateTime']['output']>;
  /** @deprecated removed */
  id: Maybe<Scalars['String']['output']>;
  nextBillAt: Maybe<Scalars['DateTime']['output']>;
  /**
   * The 'Free' plan just exists to be a placeholder and for the type convenience of frontend.
   * There won't actually be a subscription with plan 'Free'
   */
  plan: SubscriptionPlan;
  recurring: SubscriptionRecurring;
  start: Scalars['DateTime']['output'];
  status: SubscriptionStatus;
  trialEnd: Maybe<Scalars['DateTime']['output']>;
  trialStart: Maybe<Scalars['DateTime']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  variant: Maybe<SubscriptionVariant>;
}

export enum SubscriptionVariant {
  EA = 'EA',
  Onetime = 'Onetime',
}

export interface TranscriptionItemType {
  __typename?: 'TranscriptionItemType';
  end: Scalars['String']['output'];
  speaker: Scalars['String']['output'];
  start: Scalars['String']['output'];
  transcription: Scalars['String']['output'];
}

export interface TranscriptionResultType {
  __typename?: 'TranscriptionResultType';
  id: Scalars['ID']['output'];
  status: AiJobStatus;
  summary: Maybe<Scalars['String']['output']>;
  transcription: Maybe<Array<TranscriptionItemType>>;
}

export type UnionNotificationBodyType =
  | InvitationAcceptedNotificationBodyType
  | InvitationBlockedNotificationBodyType
  | InvitationNotificationBodyType
  | MentionNotificationBodyType;

export interface UnknownOauthProviderDataType {
  __typename?: 'UnknownOauthProviderDataType';
  name: Scalars['String']['output'];
}

export interface UnsupportedClientVersionDataType {
  __typename?: 'UnsupportedClientVersionDataType';
  clientVersion: Scalars['String']['output'];
  requiredVersion: Scalars['String']['output'];
}

export interface UnsupportedSubscriptionPlanDataType {
  __typename?: 'UnsupportedSubscriptionPlanDataType';
  plan: Scalars['String']['output'];
}

export interface UpdateChatSessionInput {
  /** The prompt name to use for the session */
  promptName: Scalars['String']['input'];
  sessionId: Scalars['String']['input'];
}

export interface UpdateDocDefaultRoleInput {
  docId: Scalars['String']['input'];
  role: DocRole;
  workspaceId: Scalars['String']['input'];
}

export interface UpdateDocUserRoleInput {
  docId: Scalars['String']['input'];
  role: DocRole;
  userId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface UpdateSettingsInput {
  /** Receive invitation email */
  receiveInvitationEmail?: InputMaybe<Scalars['Boolean']['input']>;
  /** Receive mention email */
  receiveMentionEmail?: InputMaybe<Scalars['Boolean']['input']>;
}

export interface UpdateUserInput {
  /** User name */
  name?: InputMaybe<Scalars['String']['input']>;
}

export interface UpdateWorkspaceInput {
  /** Enable AI */
  enableAi?: InputMaybe<Scalars['Boolean']['input']>;
  /** Enable url previous when sharing */
  enableUrlPreview?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  /** is Public workspace */
  public?: InputMaybe<Scalars['Boolean']['input']>;
}

export interface UserImportFailedType {
  __typename?: 'UserImportFailedType';
  email: Scalars['String']['output'];
  error: Scalars['String']['output'];
}

export type UserImportResultType = UserImportFailedType | UserType;

export type UserOrLimitedUser = LimitedUserType | UserType;

export interface UserQuotaHumanReadableType {
  __typename?: 'UserQuotaHumanReadableType';
  blobLimit: Scalars['String']['output'];
  copilotActionLimit: Scalars['String']['output'];
  historyPeriod: Scalars['String']['output'];
  memberLimit: Scalars['String']['output'];
  name: Scalars['String']['output'];
  storageQuota: Scalars['String']['output'];
  usedStorageQuota: Scalars['String']['output'];
}

export interface UserQuotaType {
  __typename?: 'UserQuotaType';
  blobLimit: Scalars['SafeInt']['output'];
  copilotActionLimit: Maybe<Scalars['Int']['output']>;
  historyPeriod: Scalars['SafeInt']['output'];
  humanReadable: UserQuotaHumanReadableType;
  memberLimit: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  storageQuota: Scalars['SafeInt']['output'];
  usedStorageQuota: Scalars['SafeInt']['output'];
}

export interface UserQuotaUsageType {
  __typename?: 'UserQuotaUsageType';
  /** @deprecated use `UserQuotaType['usedStorageQuota']` instead */
  storageQuota: Scalars['SafeInt']['output'];
}

export interface UserType {
  __typename?: 'UserType';
  /** User avatar url */
  avatarUrl: Maybe<Scalars['String']['output']>;
  copilot: Copilot;
  /**
   * User email verified
   * @deprecated useless
   */
  createdAt: Maybe<Scalars['DateTime']['output']>;
  /** User is disabled */
  disabled: Scalars['Boolean']['output'];
  /** User email */
  email: Scalars['String']['output'];
  /** User email verified */
  emailVerified: Scalars['Boolean']['output'];
  /** Enabled features of a user */
  features: Array<FeatureType>;
  /** User password has been set */
  hasPassword: Maybe<Scalars['Boolean']['output']>;
  id: Scalars['ID']['output'];
  /** Get user invoice count */
  invoiceCount: Scalars['Int']['output'];
  invoices: Array<InvoiceType>;
  /** User name */
  name: Scalars['String']['output'];
  /** Get user notification count */
  notificationCount: Scalars['Int']['output'];
  /** Get current user notifications */
  notifications: PaginatedNotificationObjectType;
  quota: UserQuotaType;
  quotaUsage: UserQuotaUsageType;
  /** Get user settings */
  settings: SettingsType;
  subscriptions: Array<SubscriptionType>;
  /** @deprecated use [/api/auth/sign-in?native=true] instead */
  token: TokenType;
}

export interface UserTypeCopilotArgs {
  workspaceId?: InputMaybe<Scalars['String']['input']>;
}

export interface UserTypeInvoicesArgs {
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
}

export interface UserTypeNotificationsArgs {
  pagination: PaginationInput;
}

export interface ValidationErrorDataType {
  __typename?: 'ValidationErrorDataType';
  errors: Scalars['String']['output'];
}

export interface VersionRejectedDataType {
  __typename?: 'VersionRejectedDataType';
  serverVersion: Scalars['String']['output'];
  version: Scalars['String']['output'];
}

export interface WorkspaceBlobSizes {
  __typename?: 'WorkspaceBlobSizes';
  size: Scalars['SafeInt']['output'];
}

/** Workspace invite link expire time */
export enum WorkspaceInviteLinkExpireTime {
  OneDay = 'OneDay',
  OneMonth = 'OneMonth',
  OneWeek = 'OneWeek',
  ThreeDays = 'ThreeDays',
}

/** Member invite status in workspace */
export enum WorkspaceMemberStatus {
  Accepted = 'Accepted',
  NeedMoreSeat = 'NeedMoreSeat',
  NeedMoreSeatAndReview = 'NeedMoreSeatAndReview',
  Pending = 'Pending',
  UnderReview = 'UnderReview',
}

export interface WorkspaceMembersExceedLimitToDowngradeDataType {
  __typename?: 'WorkspaceMembersExceedLimitToDowngradeDataType';
  limit: Scalars['Int']['output'];
}

export interface WorkspacePageMeta {
  __typename?: 'WorkspacePageMeta';
  createdAt: Scalars['DateTime']['output'];
  createdBy: Maybe<EditorType>;
  updatedAt: Scalars['DateTime']['output'];
  updatedBy: Maybe<EditorType>;
}

export interface WorkspacePermissionNotFoundDataType {
  __typename?: 'WorkspacePermissionNotFoundDataType';
  spaceId: Scalars['String']['output'];
}

export interface WorkspacePermissions {
  __typename?: 'WorkspacePermissions';
  Workspace_Administrators_Manage: Scalars['Boolean']['output'];
  Workspace_Blobs_List: Scalars['Boolean']['output'];
  Workspace_Blobs_Read: Scalars['Boolean']['output'];
  Workspace_Blobs_Write: Scalars['Boolean']['output'];
  Workspace_Copilot: Scalars['Boolean']['output'];
  Workspace_CreateDoc: Scalars['Boolean']['output'];
  Workspace_Delete: Scalars['Boolean']['output'];
  Workspace_Organize_Read: Scalars['Boolean']['output'];
  Workspace_Payment_Manage: Scalars['Boolean']['output'];
  Workspace_Properties_Create: Scalars['Boolean']['output'];
  Workspace_Properties_Delete: Scalars['Boolean']['output'];
  Workspace_Properties_Read: Scalars['Boolean']['output'];
  Workspace_Properties_Update: Scalars['Boolean']['output'];
  Workspace_Read: Scalars['Boolean']['output'];
  Workspace_Settings_Read: Scalars['Boolean']['output'];
  Workspace_Settings_Update: Scalars['Boolean']['output'];
  Workspace_Sync: Scalars['Boolean']['output'];
  Workspace_TransferOwner: Scalars['Boolean']['output'];
  Workspace_Users_Manage: Scalars['Boolean']['output'];
  Workspace_Users_Read: Scalars['Boolean']['output'];
}

export interface WorkspaceQuotaHumanReadableType {
  __typename?: 'WorkspaceQuotaHumanReadableType';
  blobLimit: Scalars['String']['output'];
  historyPeriod: Scalars['String']['output'];
  memberCount: Scalars['String']['output'];
  memberLimit: Scalars['String']['output'];
  name: Scalars['String']['output'];
  storageQuota: Scalars['String']['output'];
  storageQuotaUsed: Scalars['String']['output'];
}

export interface WorkspaceQuotaType {
  __typename?: 'WorkspaceQuotaType';
  blobLimit: Scalars['SafeInt']['output'];
  historyPeriod: Scalars['SafeInt']['output'];
  humanReadable: WorkspaceQuotaHumanReadableType;
  memberCount: Scalars['Int']['output'];
  memberLimit: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  storageQuota: Scalars['SafeInt']['output'];
  /** @deprecated use `usedStorageQuota` instead */
  usedSize: Scalars['SafeInt']['output'];
  usedStorageQuota: Scalars['SafeInt']['output'];
}

export interface WorkspaceRolePermissions {
  __typename?: 'WorkspaceRolePermissions';
  permissions: WorkspacePermissions;
  role: Permission;
}

export interface WorkspaceType {
  __typename?: 'WorkspaceType';
  /** List blobs of workspace */
  blobs: Array<ListedBlob>;
  /** Blobs size of workspace */
  blobsSize: Scalars['Int']['output'];
  /** Workspace created date */
  createdAt: Scalars['DateTime']['output'];
  /** Get get with given id */
  doc: DocType;
  /** Enable AI */
  enableAi: Scalars['Boolean']['output'];
  /** Enable url previous when sharing */
  enableUrlPreview: Scalars['Boolean']['output'];
  histories: Array<DocHistoryType>;
  id: Scalars['ID']['output'];
  /** is current workspace initialized */
  initialized: Scalars['Boolean']['output'];
  /** invite link for workspace */
  inviteLink: Maybe<InviteLink>;
  /** Get user invoice count */
  invoiceCount: Scalars['Int']['output'];
  invoices: Array<InvoiceType>;
  /** The selfhost license of the workspace */
  license: Maybe<License>;
  /** member count of workspace */
  memberCount: Scalars['Int']['output'];
  /** Members of workspace */
  members: Array<InviteUserType>;
  /** Owner of workspace */
  owner: UserType;
  /** Cloud page metadata of workspace */
  pageMeta: WorkspacePageMeta;
  /** map of action permissions */
  permissions: WorkspacePermissions;
  /** is Public workspace */
  public: Scalars['Boolean']['output'];
  /** Get public docs of a workspace */
  publicDocs: Array<DocType>;
  /**
   * Get public page of a workspace by page id.
   * @deprecated use [WorkspaceType.doc] instead
   */
  publicPage: Maybe<DocType>;
  /** @deprecated use [WorkspaceType.publicDocs] instead */
  publicPages: Array<DocType>;
  /** quota of workspace */
  quota: WorkspaceQuotaType;
  /** Role of current signed in user in workspace */
  role: Permission;
  /** The team subscription of the workspace, if exists. */
  subscription: Maybe<SubscriptionType>;
  /** if workspace is team workspace */
  team: Scalars['Boolean']['output'];
}

export interface WorkspaceTypeDocArgs {
  docId: Scalars['String']['input'];
}

export interface WorkspaceTypeHistoriesArgs {
  before?: InputMaybe<Scalars['DateTime']['input']>;
  guid: Scalars['String']['input'];
  take?: InputMaybe<Scalars['Int']['input']>;
}

export interface WorkspaceTypeInvoicesArgs {
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
}

export interface WorkspaceTypeMembersArgs {
  query?: InputMaybe<Scalars['String']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
}

export interface WorkspaceTypePageMetaArgs {
  pageId: Scalars['String']['input'];
}

export interface WorkspaceTypePublicPageArgs {
  pageId: Scalars['String']['input'];
}

export interface WorkspaceUserType {
  __typename?: 'WorkspaceUserType';
  avatarUrl: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
}

export interface WrongSignInCredentialsDataType {
  __typename?: 'WrongSignInCredentialsDataType';
  email: Scalars['String']['output'];
}

export interface TokenType {
  __typename?: 'tokenType';
  refresh: Scalars['String']['output'];
  sessionToken: Maybe<Scalars['String']['output']>;
  token: Scalars['String']['output'];
}

export type ActivateLicenseMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  license: Scalars['String']['input'];
}>;

export type ActivateLicenseMutation = {
  __typename?: 'Mutation';
  activateLicense: {
    __typename?: 'License';
    installedAt: string;
    validatedAt: string;
  };
};

export type AdminServerConfigQueryVariables = Exact<{ [key: string]: never }>;

export type AdminServerConfigQuery = {
  __typename?: 'Query';
  serverConfig: {
    __typename?: 'ServerConfigType';
    version: string;
    baseUrl: string;
    name: string;
    features: Array<ServerFeature>;
    type: ServerDeploymentType;
    initialized: boolean;
    availableUserFeatures: Array<FeatureType>;
    credentialsRequirement: {
      __typename?: 'CredentialsRequirementType';
      password: {
        __typename?: 'PasswordLimitsType';
        minLength: number;
        maxLength: number;
      };
    };
    availableUpgrade: {
      __typename?: 'ReleaseVersionType';
      changelog: string;
      version: string;
      publishedAt: string;
      url: string;
    };
  };
};

export type DeleteBlobMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  key: Scalars['String']['input'];
  permanently?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type DeleteBlobMutation = {
  __typename?: 'Mutation';
  deleteBlob: boolean;
};

export type ListBlobsQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type ListBlobsQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    blobs: Array<{
      __typename?: 'ListedBlob';
      key: string;
      size: number;
      mime: string;
      createdAt: string;
    }>;
  };
};

export type ReleaseDeletedBlobsMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type ReleaseDeletedBlobsMutation = {
  __typename?: 'Mutation';
  releaseDeletedBlobs: boolean;
};

export type SetBlobMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  blob: Scalars['Upload']['input'];
}>;

export type SetBlobMutation = { __typename?: 'Mutation'; setBlob: string };

export type CancelSubscriptionMutationVariables = Exact<{
  plan?: InputMaybe<SubscriptionPlan>;
  workspaceId?: InputMaybe<Scalars['String']['input']>;
}>;

export type CancelSubscriptionMutation = {
  __typename?: 'Mutation';
  cancelSubscription: {
    __typename?: 'SubscriptionType';
    id: string | null;
    status: SubscriptionStatus;
    nextBillAt: string | null;
    canceledAt: string | null;
  };
};

export type ChangeEmailMutationVariables = Exact<{
  token: Scalars['String']['input'];
  email: Scalars['String']['input'];
}>;

export type ChangeEmailMutation = {
  __typename?: 'Mutation';
  changeEmail: { __typename?: 'UserType'; id: string; email: string };
};

export type CreateChangePasswordUrlMutationVariables = Exact<{
  callbackUrl: Scalars['String']['input'];
  userId: Scalars['String']['input'];
}>;

export type CreateChangePasswordUrlMutation = {
  __typename?: 'Mutation';
  createChangePasswordUrl: string;
};

export type ChangePasswordMutationVariables = Exact<{
  token: Scalars['String']['input'];
  userId: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
}>;

export type ChangePasswordMutation = {
  __typename?: 'Mutation';
  changePassword: boolean;
};

export type AddContextCategoryMutationVariables = Exact<{
  options: AddRemoveContextCategoryInput;
}>;

export type AddContextCategoryMutation = {
  __typename?: 'Mutation';
  addContextCategory: {
    __typename?: 'CopilotContextCategory';
    id: string;
    createdAt: number;
    type: ContextCategories;
  };
};

export type RemoveContextCategoryMutationVariables = Exact<{
  options: AddRemoveContextCategoryInput;
}>;

export type RemoveContextCategoryMutation = {
  __typename?: 'Mutation';
  removeContextCategory: boolean;
};

export type CreateCopilotContextMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  sessionId: Scalars['String']['input'];
}>;

export type CreateCopilotContextMutation = {
  __typename?: 'Mutation';
  createCopilotContext: string;
};

export type AddContextDocMutationVariables = Exact<{
  options: AddContextDocInput;
}>;

export type AddContextDocMutation = {
  __typename?: 'Mutation';
  addContextDoc: {
    __typename?: 'CopilotContextDoc';
    id: string;
    createdAt: number;
    status: ContextEmbedStatus | null;
  };
};

export type RemoveContextDocMutationVariables = Exact<{
  options: RemoveContextDocInput;
}>;

export type RemoveContextDocMutation = {
  __typename?: 'Mutation';
  removeContextDoc: boolean;
};

export type AddContextFileMutationVariables = Exact<{
  content: Scalars['Upload']['input'];
  options: AddContextFileInput;
}>;

export type AddContextFileMutation = {
  __typename?: 'Mutation';
  addContextFile: {
    __typename?: 'CopilotContextFile';
    id: string;
    createdAt: number;
    name: string;
    chunkSize: number;
    error: string | null;
    status: ContextEmbedStatus;
    blobId: string;
  };
};

export type MatchContextQueryVariables = Exact<{
  contextId: Scalars['String']['input'];
  content: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['SafeInt']['input']>;
}>;

export type MatchContextQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      contexts: Array<{
        __typename?: 'CopilotContext';
        matchContext: Array<{
          __typename?: 'ContextMatchedFileChunk';
          fileId: string;
          chunk: number;
          content: string;
          distance: number | null;
        }>;
      }>;
    };
  } | null;
};

export type RemoveContextFileMutationVariables = Exact<{
  options: RemoveContextFileInput;
}>;

export type RemoveContextFileMutation = {
  __typename?: 'Mutation';
  removeContextFile: boolean;
};

export type ListContextObjectQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  sessionId: Scalars['String']['input'];
  contextId: Scalars['String']['input'];
}>;

export type ListContextObjectQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      contexts: Array<{
        __typename?: 'CopilotContext';
        docs: Array<{
          __typename?: 'CopilotContextDoc';
          id: string;
          status: ContextEmbedStatus | null;
          createdAt: number;
        }>;
        files: Array<{
          __typename?: 'CopilotContextFile';
          id: string;
          name: string;
          blobId: string;
          chunkSize: number;
          error: string | null;
          status: ContextEmbedStatus;
          createdAt: number;
        }>;
      }>;
    };
  } | null;
};

export type ListContextQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  sessionId: Scalars['String']['input'];
}>;

export type ListContextQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      contexts: Array<{
        __typename?: 'CopilotContext';
        id: string;
        workspaceId: string;
      }>;
    };
  } | null;
};

export type MatchWorkspaceContextQueryVariables = Exact<{
  contextId: Scalars['String']['input'];
  content: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['SafeInt']['input']>;
}>;

export type MatchWorkspaceContextQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      contexts: Array<{
        __typename?: 'CopilotContext';
        matchWorkspaceContext: {
          __typename?: 'ContextMatchedDocChunk';
          docId: string;
          chunk: number;
          content: string;
          distance: number | null;
        };
      }>;
    };
  } | null;
};

export type GetWorkspaceEmbeddingStatusQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetWorkspaceEmbeddingStatusQuery = {
  __typename?: 'Query';
  queryWorkspaceEmbeddingStatus: {
    __typename?: 'ContextWorkspaceEmbeddingStatus';
    total: number;
    embedded: number;
  };
};

export type QueueWorkspaceEmbeddingMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId: Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;

export type QueueWorkspaceEmbeddingMutation = {
  __typename?: 'Mutation';
  queueWorkspaceEmbedding: boolean;
};

export type GetCopilotHistoryIdsQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId?: InputMaybe<Scalars['String']['input']>;
  options?: InputMaybe<QueryChatHistoriesInput>;
}>;

export type GetCopilotHistoryIdsQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      histories: Array<{
        __typename?: 'CopilotHistories';
        sessionId: string;
        messages: Array<{
          __typename?: 'ChatMessage';
          id: string | null;
          role: string;
          createdAt: string;
        }>;
      }>;
    };
  } | null;
};

export type GetCopilotHistoriesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId?: InputMaybe<Scalars['String']['input']>;
  options?: InputMaybe<QueryChatHistoriesInput>;
}>;

export type GetCopilotHistoriesQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      histories: Array<{
        __typename?: 'CopilotHistories';
        sessionId: string;
        tokens: number;
        action: string | null;
        createdAt: string;
        messages: Array<{
          __typename?: 'ChatMessage';
          id: string | null;
          role: string;
          content: string;
          attachments: Array<string> | null;
          createdAt: string;
        }>;
      }>;
    };
  } | null;
};

export type SubmitAudioTranscriptionMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  blobId: Scalars['String']['input'];
  blob: Scalars['Upload']['input'];
}>;

export type SubmitAudioTranscriptionMutation = {
  __typename?: 'Mutation';
  submitAudioTranscription: {
    __typename?: 'TranscriptionResultType';
    id: string;
    status: AiJobStatus;
  } | null;
};

export type ClaimAudioTranscriptionMutationVariables = Exact<{
  jobId: Scalars['String']['input'];
}>;

export type ClaimAudioTranscriptionMutation = {
  __typename?: 'Mutation';
  claimAudioTranscription: {
    __typename?: 'TranscriptionResultType';
    id: string;
    status: AiJobStatus;
    summary: string | null;
    transcription: Array<{
      __typename?: 'TranscriptionItemType';
      speaker: string;
      start: string;
      end: string;
      transcription: string;
    }> | null;
  } | null;
};

export type GetAudioTranscriptionQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  jobId: Scalars['String']['input'];
}>;

export type GetAudioTranscriptionQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      audioTranscription: Array<{
        __typename?: 'TranscriptionResultType';
        id: string;
        status: AiJobStatus;
        summary: string | null;
        transcription: Array<{
          __typename?: 'TranscriptionItemType';
          speaker: string;
          start: string;
          end: string;
          transcription: string;
        }> | null;
      }>;
    };
  } | null;
};

export type CreateCopilotMessageMutationVariables = Exact<{
  options: CreateChatMessageInput;
}>;

export type CreateCopilotMessageMutation = {
  __typename?: 'Mutation';
  createCopilotMessage: string;
};

export type GetPromptsQueryVariables = Exact<{ [key: string]: never }>;

export type GetPromptsQuery = {
  __typename?: 'Query';
  listCopilotPrompts: Array<{
    __typename?: 'CopilotPromptType';
    name: string;
    model: string;
    action: string | null;
    config: {
      __typename?: 'CopilotPromptConfigType';
      jsonMode: boolean | null;
      frequencyPenalty: number | null;
      presencePenalty: number | null;
      temperature: number | null;
      topP: number | null;
    } | null;
    messages: Array<{
      __typename?: 'CopilotPromptMessageType';
      role: CopilotPromptMessageRole;
      content: string;
      params: Record<string, string> | null;
    }>;
  }>;
};

export type UpdatePromptMutationVariables = Exact<{
  name: Scalars['String']['input'];
  messages: Array<CopilotPromptMessageInput> | CopilotPromptMessageInput;
}>;

export type UpdatePromptMutation = {
  __typename?: 'Mutation';
  updateCopilotPrompt: {
    __typename?: 'CopilotPromptType';
    name: string;
    model: string;
    action: string | null;
    config: {
      __typename?: 'CopilotPromptConfigType';
      jsonMode: boolean | null;
      frequencyPenalty: number | null;
      presencePenalty: number | null;
      temperature: number | null;
      topP: number | null;
    } | null;
    messages: Array<{
      __typename?: 'CopilotPromptMessageType';
      role: CopilotPromptMessageRole;
      content: string;
      params: Record<string, string> | null;
    }>;
  };
};

export type CopilotQuotaQueryVariables = Exact<{ [key: string]: never }>;

export type CopilotQuotaQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      quota: {
        __typename?: 'CopilotQuota';
        limit: number | null;
        used: number;
      };
    };
  } | null;
};

export type CleanupCopilotSessionMutationVariables = Exact<{
  input: DeleteSessionInput;
}>;

export type CleanupCopilotSessionMutation = {
  __typename?: 'Mutation';
  cleanupCopilotSession: Array<string>;
};

export type CreateCopilotSessionMutationVariables = Exact<{
  options: CreateChatSessionInput;
}>;

export type CreateCopilotSessionMutation = {
  __typename?: 'Mutation';
  createCopilotSession: string;
};

export type ForkCopilotSessionMutationVariables = Exact<{
  options: ForkChatSessionInput;
}>;

export type ForkCopilotSessionMutation = {
  __typename?: 'Mutation';
  forkCopilotSession: string;
};

export type UpdateCopilotSessionMutationVariables = Exact<{
  options: UpdateChatSessionInput;
}>;

export type UpdateCopilotSessionMutation = {
  __typename?: 'Mutation';
  updateCopilotSession: string;
};

export type GetCopilotSessionsQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId?: InputMaybe<Scalars['String']['input']>;
  options?: InputMaybe<QueryChatSessionsInput>;
}>;

export type GetCopilotSessionsQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      sessions: Array<{
        __typename?: 'CopilotSessionType';
        id: string;
        parentSessionId: string | null;
        promptName: string;
      }>;
    };
  } | null;
};

export type CreateCheckoutSessionMutationVariables = Exact<{
  input: CreateCheckoutSessionInput;
}>;

export type CreateCheckoutSessionMutation = {
  __typename?: 'Mutation';
  createCheckoutSession: string;
};

export type CreateCustomerPortalMutationVariables = Exact<{
  [key: string]: never;
}>;

export type CreateCustomerPortalMutation = {
  __typename?: 'Mutation';
  createCustomerPortal: string;
};

export type CreateSelfhostCustomerPortalMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type CreateSelfhostCustomerPortalMutation = {
  __typename?: 'Mutation';
  createSelfhostWorkspaceCustomerPortal: string;
};

export type CreateUserMutationVariables = Exact<{
  input: CreateUserInput;
}>;

export type CreateUserMutation = {
  __typename?: 'Mutation';
  createUser: { __typename?: 'UserType'; id: string };
};

export type CreateWorkspaceMutationVariables = Exact<{ [key: string]: never }>;

export type CreateWorkspaceMutation = {
  __typename?: 'Mutation';
  createWorkspace: {
    __typename?: 'WorkspaceType';
    id: string;
    public: boolean;
    createdAt: string;
  };
};

export type DeactivateLicenseMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type DeactivateLicenseMutation = {
  __typename?: 'Mutation';
  deactivateLicense: boolean;
};

export type DeleteAccountMutationVariables = Exact<{ [key: string]: never }>;

export type DeleteAccountMutation = {
  __typename?: 'Mutation';
  deleteAccount: { __typename?: 'DeleteAccount'; success: boolean };
};

export type DeleteUserMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type DeleteUserMutation = {
  __typename?: 'Mutation';
  deleteUser: { __typename?: 'DeleteAccount'; success: boolean };
};

export type DeleteWorkspaceMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type DeleteWorkspaceMutation = {
  __typename?: 'Mutation';
  deleteWorkspace: boolean;
};

export type DisableUserMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type DisableUserMutation = {
  __typename?: 'Mutation';
  banUser: { __typename?: 'UserType'; email: string; disabled: boolean };
};

export type GetDocRolePermissionsQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId: Scalars['String']['input'];
}>;

export type GetDocRolePermissionsQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    doc: {
      __typename?: 'DocType';
      permissions: {
        __typename?: 'DocPermissions';
        Doc_Copy: boolean;
        Doc_Delete: boolean;
        Doc_Duplicate: boolean;
        Doc_Properties_Read: boolean;
        Doc_Properties_Update: boolean;
        Doc_Publish: boolean;
        Doc_Read: boolean;
        Doc_Restore: boolean;
        Doc_TransferOwner: boolean;
        Doc_Trash: boolean;
        Doc_Update: boolean;
        Doc_Users_Manage: boolean;
        Doc_Users_Read: boolean;
      };
    };
  };
};

export type EnableUserMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type EnableUserMutation = {
  __typename?: 'Mutation';
  enableUser: { __typename?: 'UserType'; email: string; disabled: boolean };
};

export type CredentialsRequirementsFragment = {
  __typename?: 'CredentialsRequirementType';
  password: {
    __typename?: 'PasswordLimitsType';
    minLength: number;
    maxLength: number;
  };
};

export type PasswordLimitsFragment = {
  __typename?: 'PasswordLimitsType';
  minLength: number;
  maxLength: number;
};

export type GenerateLicenseKeyMutationVariables = Exact<{
  sessionId: Scalars['String']['input'];
}>;

export type GenerateLicenseKeyMutation = {
  __typename?: 'Mutation';
  generateLicenseKey: string;
};

export type GetCurrentUserFeaturesQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetCurrentUserFeaturesQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    avatarUrl: string | null;
    features: Array<FeatureType>;
  } | null;
};

export type GetCurrentUserQueryVariables = Exact<{ [key: string]: never }>;

export type GetCurrentUserQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    avatarUrl: string | null;
    token: { __typename?: 'tokenType'; sessionToken: string | null };
  } | null;
};

export type GetDocDefaultRoleQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId: Scalars['String']['input'];
}>;

export type GetDocDefaultRoleQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    doc: { __typename?: 'DocType'; defaultRole: DocRole };
  };
};

export type GetInviteInfoQueryVariables = Exact<{
  inviteId: Scalars['String']['input'];
}>;

export type GetInviteInfoQuery = {
  __typename?: 'Query';
  getInviteInfo: {
    __typename?: 'InvitationType';
    workspace: {
      __typename?: 'InvitationWorkspaceType';
      id: string;
      name: string;
      avatar: string;
    };
    user: {
      __typename?: 'UserType';
      id: string;
      name: string;
      avatarUrl: string | null;
    };
  };
};

export type GetIsAdminQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetIsAdminQuery = { __typename?: 'Query'; isAdmin: boolean };

export type GetIsOwnerQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetIsOwnerQuery = { __typename?: 'Query'; isOwner: boolean };

export type GetLicenseQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetLicenseQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    license: {
      __typename?: 'License';
      expiredAt: string | null;
      installedAt: string;
      quantity: number;
      recurring: SubscriptionRecurring;
      validatedAt: string;
    } | null;
  };
};

export type GetMemberCountByWorkspaceIdQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetMemberCountByWorkspaceIdQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; memberCount: number };
};

export type GetMembersByWorkspaceIdQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  skip?: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
  query?: InputMaybe<Scalars['String']['input']>;
}>;

export type GetMembersByWorkspaceIdQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    memberCount: number;
    members: Array<{
      __typename?: 'InviteUserType';
      id: string;
      name: string | null;
      email: string | null;
      avatarUrl: string | null;
      permission: Permission;
      inviteId: string;
      emailVerified: boolean | null;
      status: WorkspaceMemberStatus;
    }>;
  };
};

export type OauthProvidersQueryVariables = Exact<{ [key: string]: never }>;

export type OauthProvidersQuery = {
  __typename?: 'Query';
  serverConfig: {
    __typename?: 'ServerConfigType';
    oauthProviders: Array<OAuthProviderType>;
  };
};

export type GetPageGrantedUsersListQueryVariables = Exact<{
  pagination: PaginationInput;
  docId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}>;

export type GetPageGrantedUsersListQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    doc: {
      __typename?: 'DocType';
      grantedUsersList: {
        __typename?: 'PaginatedGrantedDocUserType';
        totalCount: number;
        pageInfo: {
          __typename?: 'PageInfo';
          endCursor: string | null;
          hasNextPage: boolean;
        };
        edges: Array<{
          __typename?: 'GrantedDocUserTypeEdge';
          node: {
            __typename?: 'GrantedDocUserType';
            role: DocRole;
            user: {
              __typename?: 'WorkspaceUserType';
              id: string;
              name: string;
              email: string;
              avatarUrl: string | null;
            };
          };
        }>;
      };
    };
  };
};

export type GetPublicUserByIdQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetPublicUserByIdQuery = {
  __typename?: 'Query';
  publicUserById: {
    __typename?: 'PublicUserType';
    id: string;
    avatarUrl: string | null;
    name: string;
  } | null;
};

export type GetServerRuntimeConfigQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetServerRuntimeConfigQuery = {
  __typename?: 'Query';
  serverRuntimeConfig: Array<{
    __typename?: 'ServerRuntimeConfigType';
    id: string;
    module: string;
    key: string;
    description: string;
    value: Record<string, string>;
    type: RuntimeConfigType;
    updatedAt: string;
  }>;
};

export type GetServerServiceConfigsQueryVariables = Exact<{
  [key: string]: never;
}>;

export type GetServerServiceConfigsQuery = {
  __typename?: 'Query';
  serverServiceConfigs: Array<{
    __typename?: 'ServerServiceConfig';
    name: string;
    config: any;
  }>;
};

export type GetUserByEmailQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;

export type GetUserByEmailQuery = {
  __typename?: 'Query';
  userByEmail: {
    __typename?: 'UserType';
    id: string;
    name: string;
    email: string;
    features: Array<FeatureType>;
    hasPassword: boolean | null;
    emailVerified: boolean;
    avatarUrl: string | null;
    quota: {
      __typename?: 'UserQuotaType';
      humanReadable: {
        __typename?: 'UserQuotaHumanReadableType';
        blobLimit: string;
        historyPeriod: string;
        memberLimit: string;
        name: string;
        storageQuota: string;
      };
    };
  } | null;
};

export type GetUserFeaturesQueryVariables = Exact<{ [key: string]: never }>;

export type GetUserFeaturesQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    id: string;
    features: Array<FeatureType>;
  } | null;
};

export type GetUserSettingsQueryVariables = Exact<{ [key: string]: never }>;

export type GetUserSettingsQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    settings: {
      __typename?: 'SettingsType';
      receiveInvitationEmail: boolean;
      receiveMentionEmail: boolean;
    };
  } | null;
};

export type GetUserQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;

export type GetUserQuery = {
  __typename?: 'Query';
  user:
    | {
        __typename: 'LimitedUserType';
        email: string;
        hasPassword: boolean | null;
      }
    | {
        __typename: 'UserType';
        id: string;
        name: string;
        avatarUrl: string | null;
        email: string;
        hasPassword: boolean | null;
      }
    | null;
};

export type GetUsersCountQueryVariables = Exact<{ [key: string]: never }>;

export type GetUsersCountQuery = { __typename?: 'Query'; usersCount: number };

export type GetWorkspaceInfoQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetWorkspaceInfoQuery = {
  __typename?: 'Query';
  isAdmin: boolean;
  isOwner: boolean;
  workspace: { __typename?: 'WorkspaceType'; team: boolean };
};

export type GetWorkspacePageByIdQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
}>;

export type GetWorkspacePageByIdQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    doc: {
      __typename?: 'DocType';
      id: string;
      mode: PublicDocMode;
      defaultRole: DocRole;
      public: boolean;
    };
  };
};

export type GetWorkspacePageMetaByIdQueryVariables = Exact<{
  id: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
}>;

export type GetWorkspacePageMetaByIdQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    pageMeta: {
      __typename?: 'WorkspacePageMeta';
      createdAt: string;
      updatedAt: string;
      createdBy: {
        __typename?: 'EditorType';
        name: string;
        avatarUrl: string | null;
      } | null;
      updatedBy: {
        __typename?: 'EditorType';
        name: string;
        avatarUrl: string | null;
      } | null;
    };
  };
};

export type GetWorkspacePublicByIdQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetWorkspacePublicByIdQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; public: boolean };
};

export type GetWorkspacePublicPagesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetWorkspacePublicPagesQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    publicDocs: Array<{
      __typename?: 'DocType';
      id: string;
      mode: PublicDocMode;
    }>;
  };
};

export type GetWorkspaceSubscriptionQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetWorkspaceSubscriptionQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    subscription: {
      __typename?: 'SubscriptionType';
      id: string | null;
      status: SubscriptionStatus;
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
      start: string;
      end: string | null;
      nextBillAt: string | null;
      canceledAt: string | null;
      variant: SubscriptionVariant | null;
    } | null;
  };
};

export type GetWorkspaceQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetWorkspaceQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; id: string };
};

export type GetWorkspacesQueryVariables = Exact<{ [key: string]: never }>;

export type GetWorkspacesQuery = {
  __typename?: 'Query';
  workspaces: Array<{
    __typename?: 'WorkspaceType';
    id: string;
    initialized: boolean;
    team: boolean;
    owner: { __typename?: 'UserType'; id: string };
  }>;
};

export type GrantDocUserRolesMutationVariables = Exact<{
  input: GrantDocUserRolesInput;
}>;

export type GrantDocUserRolesMutation = {
  __typename?: 'Mutation';
  grantDocUserRoles: boolean;
};

export type ListHistoryQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageDocId: Scalars['String']['input'];
  take?: InputMaybe<Scalars['Int']['input']>;
  before?: InputMaybe<Scalars['DateTime']['input']>;
}>;

export type ListHistoryQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    histories: Array<{
      __typename?: 'DocHistoryType';
      id: string;
      timestamp: string;
      editor: {
        __typename?: 'EditorType';
        name: string;
        avatarUrl: string | null;
      } | null;
    }>;
  };
};

export type ImportUsersMutationVariables = Exact<{
  input: ImportUsersInput;
}>;

export type ImportUsersMutation = {
  __typename?: 'Mutation';
  importUsers: Array<
    | { __typename: 'UserImportFailedType'; email: string; error: string }
    | { __typename: 'UserType'; id: string; name: string; email: string }
  >;
};

export type GetInvoicesCountQueryVariables = Exact<{ [key: string]: never }>;

export type GetInvoicesCountQuery = {
  __typename?: 'Query';
  currentUser: { __typename?: 'UserType'; invoiceCount: number } | null;
};

export type InvoicesQueryVariables = Exact<{
  take: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;

export type InvoicesQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    invoiceCount: number;
    invoices: Array<{
      __typename?: 'InvoiceType';
      id: string | null;
      status: InvoiceStatus;
      currency: string;
      amount: number;
      reason: string;
      lastPaymentError: string | null;
      link: string | null;
      createdAt: string;
    }>;
  } | null;
};

export type LeaveWorkspaceMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  sendLeaveMail?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type LeaveWorkspaceMutation = {
  __typename?: 'Mutation';
  leaveWorkspace: boolean;
};

export type ListNotificationsQueryVariables = Exact<{
  pagination: PaginationInput;
}>;

export type ListNotificationsQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    notifications: {
      __typename?: 'PaginatedNotificationObjectType';
      totalCount: number;
      edges: Array<{
        __typename?: 'NotificationObjectTypeEdge';
        cursor: string;
        node: {
          __typename?: 'NotificationObjectType';
          id: string;
          type: NotificationType;
          level: NotificationLevel;
          read: boolean;
          createdAt: string;
          updatedAt: string;
          body: any;
        };
      }>;
      pageInfo: {
        __typename?: 'PageInfo';
        startCursor: string | null;
        endCursor: string | null;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      };
    };
  } | null;
};

export type ListUsersQueryVariables = Exact<{
  filter: ListUserInput;
}>;

export type ListUsersQuery = {
  __typename?: 'Query';
  users: Array<{
    __typename?: 'UserType';
    id: string;
    name: string;
    email: string;
    disabled: boolean;
    features: Array<FeatureType>;
    hasPassword: boolean | null;
    emailVerified: boolean;
    avatarUrl: string | null;
  }>;
};

export type MentionUserMutationVariables = Exact<{
  input: MentionInput;
}>;

export type MentionUserMutation = {
  __typename?: 'Mutation';
  mentionUser: string;
};

export type NotificationCountQueryVariables = Exact<{ [key: string]: never }>;

export type NotificationCountQuery = {
  __typename?: 'Query';
  currentUser: { __typename?: 'UserType'; notificationCount: number } | null;
};

export type PricesQueryVariables = Exact<{ [key: string]: never }>;

export type PricesQuery = {
  __typename?: 'Query';
  prices: Array<{
    __typename?: 'SubscriptionPrice';
    type: string;
    plan: SubscriptionPlan;
    currency: string;
    amount: number | null;
    yearlyAmount: number | null;
    lifetimeAmount: number | null;
  }>;
};

export type PublishPageMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
  mode?: InputMaybe<PublicDocMode>;
}>;

export type PublishPageMutation = {
  __typename?: 'Mutation';
  publishDoc: { __typename?: 'DocType'; id: string; mode: PublicDocMode };
};

export type QuotaQueryVariables = Exact<{ [key: string]: never }>;

export type QuotaQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    id: string;
    quota: {
      __typename?: 'UserQuotaType';
      name: string;
      blobLimit: number;
      storageQuota: number;
      historyPeriod: number;
      memberLimit: number;
      humanReadable: {
        __typename?: 'UserQuotaHumanReadableType';
        name: string;
        blobLimit: string;
        storageQuota: string;
        historyPeriod: string;
        memberLimit: string;
      };
    };
    quotaUsage: { __typename?: 'UserQuotaUsageType'; storageQuota: number };
  } | null;
};

export type ReadNotificationMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type ReadNotificationMutation = {
  __typename?: 'Mutation';
  readNotification: boolean;
};

export type RecoverDocMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId: Scalars['String']['input'];
  timestamp: Scalars['DateTime']['input'];
}>;

export type RecoverDocMutation = {
  __typename?: 'Mutation';
  recoverDoc: string;
};

export type RemoveAvatarMutationVariables = Exact<{ [key: string]: never }>;

export type RemoveAvatarMutation = {
  __typename?: 'Mutation';
  removeAvatar: { __typename?: 'RemoveAvatar'; success: boolean };
};

export type ResumeSubscriptionMutationVariables = Exact<{
  plan?: InputMaybe<SubscriptionPlan>;
  workspaceId?: InputMaybe<Scalars['String']['input']>;
}>;

export type ResumeSubscriptionMutation = {
  __typename?: 'Mutation';
  resumeSubscription: {
    __typename?: 'SubscriptionType';
    id: string | null;
    status: SubscriptionStatus;
    nextBillAt: string | null;
    start: string;
    end: string | null;
  };
};

export type RevokeDocUserRolesMutationVariables = Exact<{
  input: RevokeDocUserRoleInput;
}>;

export type RevokeDocUserRolesMutation = {
  __typename?: 'Mutation';
  revokeDocUserRoles: boolean;
};

export type RevokeMemberPermissionMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  userId: Scalars['String']['input'];
}>;

export type RevokeMemberPermissionMutation = {
  __typename?: 'Mutation';
  revoke: boolean;
};

export type RevokePublicPageMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
}>;

export type RevokePublicPageMutation = {
  __typename?: 'Mutation';
  revokePublicDoc: {
    __typename?: 'DocType';
    id: string;
    mode: PublicDocMode;
    public: boolean;
  };
};

export type SendChangeEmailMutationVariables = Exact<{
  callbackUrl: Scalars['String']['input'];
}>;

export type SendChangeEmailMutation = {
  __typename?: 'Mutation';
  sendChangeEmail: boolean;
};

export type SendChangePasswordEmailMutationVariables = Exact<{
  callbackUrl: Scalars['String']['input'];
}>;

export type SendChangePasswordEmailMutation = {
  __typename?: 'Mutation';
  sendChangePasswordEmail: boolean;
};

export type SendSetPasswordEmailMutationVariables = Exact<{
  callbackUrl: Scalars['String']['input'];
}>;

export type SendSetPasswordEmailMutation = {
  __typename?: 'Mutation';
  sendSetPasswordEmail: boolean;
};

export type SendVerifyChangeEmailMutationVariables = Exact<{
  token: Scalars['String']['input'];
  email: Scalars['String']['input'];
  callbackUrl: Scalars['String']['input'];
}>;

export type SendVerifyChangeEmailMutation = {
  __typename?: 'Mutation';
  sendVerifyChangeEmail: boolean;
};

export type SendVerifyEmailMutationVariables = Exact<{
  callbackUrl: Scalars['String']['input'];
}>;

export type SendVerifyEmailMutation = {
  __typename?: 'Mutation';
  sendVerifyEmail: boolean;
};

export type ServerConfigQueryVariables = Exact<{ [key: string]: never }>;

export type ServerConfigQuery = {
  __typename?: 'Query';
  serverConfig: {
    __typename?: 'ServerConfigType';
    version: string;
    baseUrl: string;
    name: string;
    features: Array<ServerFeature>;
    type: ServerDeploymentType;
    initialized: boolean;
    credentialsRequirement: {
      __typename?: 'CredentialsRequirementType';
      password: {
        __typename?: 'PasswordLimitsType';
        minLength: number;
        maxLength: number;
      };
    };
  };
};

export type SetWorkspacePublicByIdMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  public: Scalars['Boolean']['input'];
}>;

export type SetWorkspacePublicByIdMutation = {
  __typename?: 'Mutation';
  updateWorkspace: { __typename?: 'WorkspaceType'; id: string };
};

export type SubscriptionQueryVariables = Exact<{ [key: string]: never }>;

export type SubscriptionQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    id: string;
    subscriptions: Array<{
      __typename?: 'SubscriptionType';
      id: string | null;
      status: SubscriptionStatus;
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
      start: string;
      end: string | null;
      nextBillAt: string | null;
      canceledAt: string | null;
      variant: SubscriptionVariant | null;
    }>;
  } | null;
};

export type UpdateAccountFeaturesMutationVariables = Exact<{
  userId: Scalars['String']['input'];
  features: Array<FeatureType> | FeatureType;
}>;

export type UpdateAccountFeaturesMutation = {
  __typename?: 'Mutation';
  updateUserFeatures: Array<FeatureType>;
};

export type UpdateAccountMutationVariables = Exact<{
  id: Scalars['String']['input'];
  input: ManageUserInput;
}>;

export type UpdateAccountMutation = {
  __typename?: 'Mutation';
  updateUser: {
    __typename?: 'UserType';
    id: string;
    name: string;
    email: string;
  };
};

export type UpdateDocDefaultRoleMutationVariables = Exact<{
  input: UpdateDocDefaultRoleInput;
}>;

export type UpdateDocDefaultRoleMutation = {
  __typename?: 'Mutation';
  updateDocDefaultRole: boolean;
};

export type UpdateDocUserRoleMutationVariables = Exact<{
  input: UpdateDocUserRoleInput;
}>;

export type UpdateDocUserRoleMutation = {
  __typename?: 'Mutation';
  updateDocUserRole: boolean;
};

export type UpdateServerRuntimeConfigsMutationVariables = Exact<{
  updates: Scalars['JSONObject']['input'];
}>;

export type UpdateServerRuntimeConfigsMutation = {
  __typename?: 'Mutation';
  updateRuntimeConfigs: Array<{
    __typename?: 'ServerRuntimeConfigType';
    key: string;
    value: Record<string, string>;
  }>;
};

export type UpdateSubscriptionMutationVariables = Exact<{
  plan?: InputMaybe<SubscriptionPlan>;
  recurring: SubscriptionRecurring;
  workspaceId?: InputMaybe<Scalars['String']['input']>;
}>;

export type UpdateSubscriptionMutation = {
  __typename?: 'Mutation';
  updateSubscriptionRecurring: {
    __typename?: 'SubscriptionType';
    id: string | null;
    plan: SubscriptionPlan;
    recurring: SubscriptionRecurring;
    nextBillAt: string | null;
  };
};

export type UpdateUserProfileMutationVariables = Exact<{
  input: UpdateUserInput;
}>;

export type UpdateUserProfileMutation = {
  __typename?: 'Mutation';
  updateProfile: { __typename?: 'UserType'; id: string; name: string };
};

export type UpdateUserSettingsMutationVariables = Exact<{
  input: UpdateSettingsInput;
}>;

export type UpdateUserSettingsMutation = {
  __typename?: 'Mutation';
  updateSettings: boolean;
};

export type UploadAvatarMutationVariables = Exact<{
  avatar: Scalars['Upload']['input'];
}>;

export type UploadAvatarMutation = {
  __typename?: 'Mutation';
  uploadAvatar: {
    __typename?: 'UserType';
    id: string;
    name: string;
    avatarUrl: string | null;
    email: string;
  };
};

export type VerifyEmailMutationVariables = Exact<{
  token: Scalars['String']['input'];
}>;

export type VerifyEmailMutation = {
  __typename?: 'Mutation';
  verifyEmail: boolean;
};

export type GetWorkspaceConfigQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetWorkspaceConfigQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    enableAi: boolean;
    enableUrlPreview: boolean;
    inviteLink: {
      __typename?: 'InviteLink';
      link: string;
      expireTime: string;
    } | null;
  };
};

export type SetEnableAiMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  enableAi: Scalars['Boolean']['input'];
}>;

export type SetEnableAiMutation = {
  __typename?: 'Mutation';
  updateWorkspace: { __typename?: 'WorkspaceType'; id: string };
};

export type SetEnableUrlPreviewMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  enableUrlPreview: Scalars['Boolean']['input'];
}>;

export type SetEnableUrlPreviewMutation = {
  __typename?: 'Mutation';
  updateWorkspace: { __typename?: 'WorkspaceType'; id: string };
};

export type InviteByEmailMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  email: Scalars['String']['input'];
  sendInviteMail?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type InviteByEmailMutation = { __typename?: 'Mutation'; invite: string };

export type InviteByEmailsMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  emails: Array<Scalars['String']['input']> | Scalars['String']['input'];
  sendInviteMail?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type InviteByEmailsMutation = {
  __typename?: 'Mutation';
  inviteBatch: Array<{
    __typename?: 'InviteResult';
    email: string;
    inviteId: string | null;
    sentSuccess: boolean;
  }>;
};

export type AcceptInviteByInviteIdMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  inviteId: Scalars['String']['input'];
  sendAcceptMail?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type AcceptInviteByInviteIdMutation = {
  __typename?: 'Mutation';
  acceptInviteById: boolean;
};

export type InviteBatchMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  emails: Array<Scalars['String']['input']> | Scalars['String']['input'];
  sendInviteMail?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type InviteBatchMutation = {
  __typename?: 'Mutation';
  inviteBatch: Array<{
    __typename?: 'InviteResult';
    email: string;
    inviteId: string | null;
    sentSuccess: boolean;
  }>;
};

export type CreateInviteLinkMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  expireTime: WorkspaceInviteLinkExpireTime;
}>;

export type CreateInviteLinkMutation = {
  __typename?: 'Mutation';
  createInviteLink: {
    __typename?: 'InviteLink';
    link: string;
    expireTime: string;
  };
};

export type RevokeInviteLinkMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type RevokeInviteLinkMutation = {
  __typename?: 'Mutation';
  revokeInviteLink: boolean;
};

export type WorkspaceInvoicesQueryVariables = Exact<{
  take: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
  workspaceId: Scalars['String']['input'];
}>;

export type WorkspaceInvoicesQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    invoiceCount: number;
    invoices: Array<{
      __typename?: 'InvoiceType';
      id: string | null;
      status: InvoiceStatus;
      currency: string;
      amount: number;
      reason: string;
      lastPaymentError: string | null;
      link: string | null;
      createdAt: string;
    }>;
  };
};

export type WorkspaceQuotaQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type WorkspaceQuotaQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    quota: {
      __typename?: 'WorkspaceQuotaType';
      name: string;
      blobLimit: number;
      storageQuota: number;
      usedStorageQuota: number;
      historyPeriod: number;
      memberLimit: number;
      memberCount: number;
      humanReadable: {
        __typename?: 'WorkspaceQuotaHumanReadableType';
        name: string;
        blobLimit: string;
        storageQuota: string;
        historyPeriod: string;
        memberLimit: string;
      };
    };
  };
};

export type GetWorkspaceRolePermissionsQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetWorkspaceRolePermissionsQuery = {
  __typename?: 'Query';
  workspaceRolePermissions: {
    __typename?: 'WorkspaceRolePermissions';
    permissions: {
      __typename?: 'WorkspacePermissions';
      Workspace_Administrators_Manage: boolean;
      Workspace_Blobs_List: boolean;
      Workspace_Blobs_Read: boolean;
      Workspace_Blobs_Write: boolean;
      Workspace_Copilot: boolean;
      Workspace_CreateDoc: boolean;
      Workspace_Delete: boolean;
      Workspace_Organize_Read: boolean;
      Workspace_Payment_Manage: boolean;
      Workspace_Properties_Create: boolean;
      Workspace_Properties_Delete: boolean;
      Workspace_Properties_Read: boolean;
      Workspace_Properties_Update: boolean;
      Workspace_Read: boolean;
      Workspace_Settings_Read: boolean;
      Workspace_Settings_Update: boolean;
      Workspace_Sync: boolean;
      Workspace_TransferOwner: boolean;
      Workspace_Users_Manage: boolean;
      Workspace_Users_Read: boolean;
    };
  };
};

export type ApproveWorkspaceTeamMemberMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  userId: Scalars['String']['input'];
}>;

export type ApproveWorkspaceTeamMemberMutation = {
  __typename?: 'Mutation';
  approveMember: boolean;
};

export type GrantWorkspaceTeamMemberMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  userId: Scalars['String']['input'];
  permission: Permission;
}>;

export type GrantWorkspaceTeamMemberMutation = {
  __typename?: 'Mutation';
  grantMember: boolean;
};

export type Queries =
  | {
      name: 'adminServerConfigQuery';
      variables: AdminServerConfigQueryVariables;
      response: AdminServerConfigQuery;
    }
  | {
      name: 'listBlobsQuery';
      variables: ListBlobsQueryVariables;
      response: ListBlobsQuery;
    }
  | {
      name: 'matchContextQuery';
      variables: MatchContextQueryVariables;
      response: MatchContextQuery;
    }
  | {
      name: 'listContextObjectQuery';
      variables: ListContextObjectQueryVariables;
      response: ListContextObjectQuery;
    }
  | {
      name: 'listContextQuery';
      variables: ListContextQueryVariables;
      response: ListContextQuery;
    }
  | {
      name: 'matchWorkspaceContextQuery';
      variables: MatchWorkspaceContextQueryVariables;
      response: MatchWorkspaceContextQuery;
    }
  | {
      name: 'getWorkspaceEmbeddingStatusQuery';
      variables: GetWorkspaceEmbeddingStatusQueryVariables;
      response: GetWorkspaceEmbeddingStatusQuery;
    }
  | {
      name: 'getCopilotHistoryIdsQuery';
      variables: GetCopilotHistoryIdsQueryVariables;
      response: GetCopilotHistoryIdsQuery;
    }
  | {
      name: 'getCopilotHistoriesQuery';
      variables: GetCopilotHistoriesQueryVariables;
      response: GetCopilotHistoriesQuery;
    }
  | {
      name: 'getAudioTranscriptionQuery';
      variables: GetAudioTranscriptionQueryVariables;
      response: GetAudioTranscriptionQuery;
    }
  | {
      name: 'getPromptsQuery';
      variables: GetPromptsQueryVariables;
      response: GetPromptsQuery;
    }
  | {
      name: 'copilotQuotaQuery';
      variables: CopilotQuotaQueryVariables;
      response: CopilotQuotaQuery;
    }
  | {
      name: 'getCopilotSessionsQuery';
      variables: GetCopilotSessionsQueryVariables;
      response: GetCopilotSessionsQuery;
    }
  | {
      name: 'getDocRolePermissionsQuery';
      variables: GetDocRolePermissionsQueryVariables;
      response: GetDocRolePermissionsQuery;
    }
  | {
      name: 'getCurrentUserFeaturesQuery';
      variables: GetCurrentUserFeaturesQueryVariables;
      response: GetCurrentUserFeaturesQuery;
    }
  | {
      name: 'getCurrentUserQuery';
      variables: GetCurrentUserQueryVariables;
      response: GetCurrentUserQuery;
    }
  | {
      name: 'getDocDefaultRoleQuery';
      variables: GetDocDefaultRoleQueryVariables;
      response: GetDocDefaultRoleQuery;
    }
  | {
      name: 'getInviteInfoQuery';
      variables: GetInviteInfoQueryVariables;
      response: GetInviteInfoQuery;
    }
  | {
      name: 'getIsAdminQuery';
      variables: GetIsAdminQueryVariables;
      response: GetIsAdminQuery;
    }
  | {
      name: 'getIsOwnerQuery';
      variables: GetIsOwnerQueryVariables;
      response: GetIsOwnerQuery;
    }
  | {
      name: 'getLicenseQuery';
      variables: GetLicenseQueryVariables;
      response: GetLicenseQuery;
    }
  | {
      name: 'getMemberCountByWorkspaceIdQuery';
      variables: GetMemberCountByWorkspaceIdQueryVariables;
      response: GetMemberCountByWorkspaceIdQuery;
    }
  | {
      name: 'getMembersByWorkspaceIdQuery';
      variables: GetMembersByWorkspaceIdQueryVariables;
      response: GetMembersByWorkspaceIdQuery;
    }
  | {
      name: 'oauthProvidersQuery';
      variables: OauthProvidersQueryVariables;
      response: OauthProvidersQuery;
    }
  | {
      name: 'getPageGrantedUsersListQuery';
      variables: GetPageGrantedUsersListQueryVariables;
      response: GetPageGrantedUsersListQuery;
    }
  | {
      name: 'getPublicUserByIdQuery';
      variables: GetPublicUserByIdQueryVariables;
      response: GetPublicUserByIdQuery;
    }
  | {
      name: 'getServerRuntimeConfigQuery';
      variables: GetServerRuntimeConfigQueryVariables;
      response: GetServerRuntimeConfigQuery;
    }
  | {
      name: 'getServerServiceConfigsQuery';
      variables: GetServerServiceConfigsQueryVariables;
      response: GetServerServiceConfigsQuery;
    }
  | {
      name: 'getUserByEmailQuery';
      variables: GetUserByEmailQueryVariables;
      response: GetUserByEmailQuery;
    }
  | {
      name: 'getUserFeaturesQuery';
      variables: GetUserFeaturesQueryVariables;
      response: GetUserFeaturesQuery;
    }
  | {
      name: 'getUserSettingsQuery';
      variables: GetUserSettingsQueryVariables;
      response: GetUserSettingsQuery;
    }
  | {
      name: 'getUserQuery';
      variables: GetUserQueryVariables;
      response: GetUserQuery;
    }
  | {
      name: 'getUsersCountQuery';
      variables: GetUsersCountQueryVariables;
      response: GetUsersCountQuery;
    }
  | {
      name: 'getWorkspaceInfoQuery';
      variables: GetWorkspaceInfoQueryVariables;
      response: GetWorkspaceInfoQuery;
    }
  | {
      name: 'getWorkspacePageByIdQuery';
      variables: GetWorkspacePageByIdQueryVariables;
      response: GetWorkspacePageByIdQuery;
    }
  | {
      name: 'getWorkspacePageMetaByIdQuery';
      variables: GetWorkspacePageMetaByIdQueryVariables;
      response: GetWorkspacePageMetaByIdQuery;
    }
  | {
      name: 'getWorkspacePublicByIdQuery';
      variables: GetWorkspacePublicByIdQueryVariables;
      response: GetWorkspacePublicByIdQuery;
    }
  | {
      name: 'getWorkspacePublicPagesQuery';
      variables: GetWorkspacePublicPagesQueryVariables;
      response: GetWorkspacePublicPagesQuery;
    }
  | {
      name: 'getWorkspaceSubscriptionQuery';
      variables: GetWorkspaceSubscriptionQueryVariables;
      response: GetWorkspaceSubscriptionQuery;
    }
  | {
      name: 'getWorkspaceQuery';
      variables: GetWorkspaceQueryVariables;
      response: GetWorkspaceQuery;
    }
  | {
      name: 'getWorkspacesQuery';
      variables: GetWorkspacesQueryVariables;
      response: GetWorkspacesQuery;
    }
  | {
      name: 'listHistoryQuery';
      variables: ListHistoryQueryVariables;
      response: ListHistoryQuery;
    }
  | {
      name: 'getInvoicesCountQuery';
      variables: GetInvoicesCountQueryVariables;
      response: GetInvoicesCountQuery;
    }
  | {
      name: 'invoicesQuery';
      variables: InvoicesQueryVariables;
      response: InvoicesQuery;
    }
  | {
      name: 'listNotificationsQuery';
      variables: ListNotificationsQueryVariables;
      response: ListNotificationsQuery;
    }
  | {
      name: 'listUsersQuery';
      variables: ListUsersQueryVariables;
      response: ListUsersQuery;
    }
  | {
      name: 'notificationCountQuery';
      variables: NotificationCountQueryVariables;
      response: NotificationCountQuery;
    }
  | {
      name: 'pricesQuery';
      variables: PricesQueryVariables;
      response: PricesQuery;
    }
  | {
      name: 'quotaQuery';
      variables: QuotaQueryVariables;
      response: QuotaQuery;
    }
  | {
      name: 'serverConfigQuery';
      variables: ServerConfigQueryVariables;
      response: ServerConfigQuery;
    }
  | {
      name: 'subscriptionQuery';
      variables: SubscriptionQueryVariables;
      response: SubscriptionQuery;
    }
  | {
      name: 'getWorkspaceConfigQuery';
      variables: GetWorkspaceConfigQueryVariables;
      response: GetWorkspaceConfigQuery;
    }
  | {
      name: 'workspaceInvoicesQuery';
      variables: WorkspaceInvoicesQueryVariables;
      response: WorkspaceInvoicesQuery;
    }
  | {
      name: 'workspaceQuotaQuery';
      variables: WorkspaceQuotaQueryVariables;
      response: WorkspaceQuotaQuery;
    }
  | {
      name: 'getWorkspaceRolePermissionsQuery';
      variables: GetWorkspaceRolePermissionsQueryVariables;
      response: GetWorkspaceRolePermissionsQuery;
    };

export type Mutations =
  | {
      name: 'activateLicenseMutation';
      variables: ActivateLicenseMutationVariables;
      response: ActivateLicenseMutation;
    }
  | {
      name: 'deleteBlobMutation';
      variables: DeleteBlobMutationVariables;
      response: DeleteBlobMutation;
    }
  | {
      name: 'releaseDeletedBlobsMutation';
      variables: ReleaseDeletedBlobsMutationVariables;
      response: ReleaseDeletedBlobsMutation;
    }
  | {
      name: 'setBlobMutation';
      variables: SetBlobMutationVariables;
      response: SetBlobMutation;
    }
  | {
      name: 'cancelSubscriptionMutation';
      variables: CancelSubscriptionMutationVariables;
      response: CancelSubscriptionMutation;
    }
  | {
      name: 'changeEmailMutation';
      variables: ChangeEmailMutationVariables;
      response: ChangeEmailMutation;
    }
  | {
      name: 'createChangePasswordUrlMutation';
      variables: CreateChangePasswordUrlMutationVariables;
      response: CreateChangePasswordUrlMutation;
    }
  | {
      name: 'changePasswordMutation';
      variables: ChangePasswordMutationVariables;
      response: ChangePasswordMutation;
    }
  | {
      name: 'addContextCategoryMutation';
      variables: AddContextCategoryMutationVariables;
      response: AddContextCategoryMutation;
    }
  | {
      name: 'removeContextCategoryMutation';
      variables: RemoveContextCategoryMutationVariables;
      response: RemoveContextCategoryMutation;
    }
  | {
      name: 'createCopilotContextMutation';
      variables: CreateCopilotContextMutationVariables;
      response: CreateCopilotContextMutation;
    }
  | {
      name: 'addContextDocMutation';
      variables: AddContextDocMutationVariables;
      response: AddContextDocMutation;
    }
  | {
      name: 'removeContextDocMutation';
      variables: RemoveContextDocMutationVariables;
      response: RemoveContextDocMutation;
    }
  | {
      name: 'addContextFileMutation';
      variables: AddContextFileMutationVariables;
      response: AddContextFileMutation;
    }
  | {
      name: 'removeContextFileMutation';
      variables: RemoveContextFileMutationVariables;
      response: RemoveContextFileMutation;
    }
  | {
      name: 'queueWorkspaceEmbeddingMutation';
      variables: QueueWorkspaceEmbeddingMutationVariables;
      response: QueueWorkspaceEmbeddingMutation;
    }
  | {
      name: 'submitAudioTranscriptionMutation';
      variables: SubmitAudioTranscriptionMutationVariables;
      response: SubmitAudioTranscriptionMutation;
    }
  | {
      name: 'claimAudioTranscriptionMutation';
      variables: ClaimAudioTranscriptionMutationVariables;
      response: ClaimAudioTranscriptionMutation;
    }
  | {
      name: 'createCopilotMessageMutation';
      variables: CreateCopilotMessageMutationVariables;
      response: CreateCopilotMessageMutation;
    }
  | {
      name: 'updatePromptMutation';
      variables: UpdatePromptMutationVariables;
      response: UpdatePromptMutation;
    }
  | {
      name: 'cleanupCopilotSessionMutation';
      variables: CleanupCopilotSessionMutationVariables;
      response: CleanupCopilotSessionMutation;
    }
  | {
      name: 'createCopilotSessionMutation';
      variables: CreateCopilotSessionMutationVariables;
      response: CreateCopilotSessionMutation;
    }
  | {
      name: 'forkCopilotSessionMutation';
      variables: ForkCopilotSessionMutationVariables;
      response: ForkCopilotSessionMutation;
    }
  | {
      name: 'updateCopilotSessionMutation';
      variables: UpdateCopilotSessionMutationVariables;
      response: UpdateCopilotSessionMutation;
    }
  | {
      name: 'createCheckoutSessionMutation';
      variables: CreateCheckoutSessionMutationVariables;
      response: CreateCheckoutSessionMutation;
    }
  | {
      name: 'createCustomerPortalMutation';
      variables: CreateCustomerPortalMutationVariables;
      response: CreateCustomerPortalMutation;
    }
  | {
      name: 'createSelfhostCustomerPortalMutation';
      variables: CreateSelfhostCustomerPortalMutationVariables;
      response: CreateSelfhostCustomerPortalMutation;
    }
  | {
      name: 'createUserMutation';
      variables: CreateUserMutationVariables;
      response: CreateUserMutation;
    }
  | {
      name: 'createWorkspaceMutation';
      variables: CreateWorkspaceMutationVariables;
      response: CreateWorkspaceMutation;
    }
  | {
      name: 'deactivateLicenseMutation';
      variables: DeactivateLicenseMutationVariables;
      response: DeactivateLicenseMutation;
    }
  | {
      name: 'deleteAccountMutation';
      variables: DeleteAccountMutationVariables;
      response: DeleteAccountMutation;
    }
  | {
      name: 'deleteUserMutation';
      variables: DeleteUserMutationVariables;
      response: DeleteUserMutation;
    }
  | {
      name: 'deleteWorkspaceMutation';
      variables: DeleteWorkspaceMutationVariables;
      response: DeleteWorkspaceMutation;
    }
  | {
      name: 'disableUserMutation';
      variables: DisableUserMutationVariables;
      response: DisableUserMutation;
    }
  | {
      name: 'enableUserMutation';
      variables: EnableUserMutationVariables;
      response: EnableUserMutation;
    }
  | {
      name: 'generateLicenseKeyMutation';
      variables: GenerateLicenseKeyMutationVariables;
      response: GenerateLicenseKeyMutation;
    }
  | {
      name: 'grantDocUserRolesMutation';
      variables: GrantDocUserRolesMutationVariables;
      response: GrantDocUserRolesMutation;
    }
  | {
      name: 'importUsersMutation';
      variables: ImportUsersMutationVariables;
      response: ImportUsersMutation;
    }
  | {
      name: 'leaveWorkspaceMutation';
      variables: LeaveWorkspaceMutationVariables;
      response: LeaveWorkspaceMutation;
    }
  | {
      name: 'mentionUserMutation';
      variables: MentionUserMutationVariables;
      response: MentionUserMutation;
    }
  | {
      name: 'publishPageMutation';
      variables: PublishPageMutationVariables;
      response: PublishPageMutation;
    }
  | {
      name: 'readNotificationMutation';
      variables: ReadNotificationMutationVariables;
      response: ReadNotificationMutation;
    }
  | {
      name: 'recoverDocMutation';
      variables: RecoverDocMutationVariables;
      response: RecoverDocMutation;
    }
  | {
      name: 'removeAvatarMutation';
      variables: RemoveAvatarMutationVariables;
      response: RemoveAvatarMutation;
    }
  | {
      name: 'resumeSubscriptionMutation';
      variables: ResumeSubscriptionMutationVariables;
      response: ResumeSubscriptionMutation;
    }
  | {
      name: 'revokeDocUserRolesMutation';
      variables: RevokeDocUserRolesMutationVariables;
      response: RevokeDocUserRolesMutation;
    }
  | {
      name: 'revokeMemberPermissionMutation';
      variables: RevokeMemberPermissionMutationVariables;
      response: RevokeMemberPermissionMutation;
    }
  | {
      name: 'revokePublicPageMutation';
      variables: RevokePublicPageMutationVariables;
      response: RevokePublicPageMutation;
    }
  | {
      name: 'sendChangeEmailMutation';
      variables: SendChangeEmailMutationVariables;
      response: SendChangeEmailMutation;
    }
  | {
      name: 'sendChangePasswordEmailMutation';
      variables: SendChangePasswordEmailMutationVariables;
      response: SendChangePasswordEmailMutation;
    }
  | {
      name: 'sendSetPasswordEmailMutation';
      variables: SendSetPasswordEmailMutationVariables;
      response: SendSetPasswordEmailMutation;
    }
  | {
      name: 'sendVerifyChangeEmailMutation';
      variables: SendVerifyChangeEmailMutationVariables;
      response: SendVerifyChangeEmailMutation;
    }
  | {
      name: 'sendVerifyEmailMutation';
      variables: SendVerifyEmailMutationVariables;
      response: SendVerifyEmailMutation;
    }
  | {
      name: 'setWorkspacePublicByIdMutation';
      variables: SetWorkspacePublicByIdMutationVariables;
      response: SetWorkspacePublicByIdMutation;
    }
  | {
      name: 'updateAccountFeaturesMutation';
      variables: UpdateAccountFeaturesMutationVariables;
      response: UpdateAccountFeaturesMutation;
    }
  | {
      name: 'updateAccountMutation';
      variables: UpdateAccountMutationVariables;
      response: UpdateAccountMutation;
    }
  | {
      name: 'updateDocDefaultRoleMutation';
      variables: UpdateDocDefaultRoleMutationVariables;
      response: UpdateDocDefaultRoleMutation;
    }
  | {
      name: 'updateDocUserRoleMutation';
      variables: UpdateDocUserRoleMutationVariables;
      response: UpdateDocUserRoleMutation;
    }
  | {
      name: 'updateServerRuntimeConfigsMutation';
      variables: UpdateServerRuntimeConfigsMutationVariables;
      response: UpdateServerRuntimeConfigsMutation;
    }
  | {
      name: 'updateSubscriptionMutation';
      variables: UpdateSubscriptionMutationVariables;
      response: UpdateSubscriptionMutation;
    }
  | {
      name: 'updateUserProfileMutation';
      variables: UpdateUserProfileMutationVariables;
      response: UpdateUserProfileMutation;
    }
  | {
      name: 'updateUserSettingsMutation';
      variables: UpdateUserSettingsMutationVariables;
      response: UpdateUserSettingsMutation;
    }
  | {
      name: 'uploadAvatarMutation';
      variables: UploadAvatarMutationVariables;
      response: UploadAvatarMutation;
    }
  | {
      name: 'verifyEmailMutation';
      variables: VerifyEmailMutationVariables;
      response: VerifyEmailMutation;
    }
  | {
      name: 'setEnableAiMutation';
      variables: SetEnableAiMutationVariables;
      response: SetEnableAiMutation;
    }
  | {
      name: 'setEnableUrlPreviewMutation';
      variables: SetEnableUrlPreviewMutationVariables;
      response: SetEnableUrlPreviewMutation;
    }
  | {
      name: 'inviteByEmailMutation';
      variables: InviteByEmailMutationVariables;
      response: InviteByEmailMutation;
    }
  | {
      name: 'inviteByEmailsMutation';
      variables: InviteByEmailsMutationVariables;
      response: InviteByEmailsMutation;
    }
  | {
      name: 'acceptInviteByInviteIdMutation';
      variables: AcceptInviteByInviteIdMutationVariables;
      response: AcceptInviteByInviteIdMutation;
    }
  | {
      name: 'inviteBatchMutation';
      variables: InviteBatchMutationVariables;
      response: InviteBatchMutation;
    }
  | {
      name: 'createInviteLinkMutation';
      variables: CreateInviteLinkMutationVariables;
      response: CreateInviteLinkMutation;
    }
  | {
      name: 'revokeInviteLinkMutation';
      variables: RevokeInviteLinkMutationVariables;
      response: RevokeInviteLinkMutation;
    }
  | {
      name: 'approveWorkspaceTeamMemberMutation';
      variables: ApproveWorkspaceTeamMemberMutationVariables;
      response: ApproveWorkspaceTeamMemberMutation;
    }
  | {
      name: 'grantWorkspaceTeamMemberMutation';
      variables: GrantWorkspaceTeamMemberMutationVariables;
      response: GrantWorkspaceTeamMemberMutation;
    };
