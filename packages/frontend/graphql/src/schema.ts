/* eslint-disable */
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

export interface Copilot {
  __typename?: 'Copilot';
  /** Get the session list of actions in the workspace */
  actions: Array<Scalars['String']['output']>;
  /** Get the session list of chats in the workspace */
  chats: Array<Scalars['String']['output']>;
  histories: Array<CopilotHistories>;
  /** Get the quota of the user in the workspace */
  quota: CopilotQuota;
  workspaceId: Maybe<Scalars['ID']['output']>;
}

export interface CopilotHistoriesArgs {
  docId: InputMaybe<Scalars['String']['input']>;
  options: InputMaybe<QueryChatHistoriesInput>;
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

export interface CopilotMessageNotFoundDataType {
  __typename?: 'CopilotMessageNotFoundDataType';
  messageId: Scalars['String']['output'];
}

export enum CopilotModels {
  DallE3 = 'DallE3',
  Gpt4Omni = 'Gpt4Omni',
  Gpt4OmniMini = 'Gpt4OmniMini',
  TextEmbedding3Large = 'TextEmbedding3Large',
  TextEmbedding3Small = 'TextEmbedding3Small',
  TextEmbeddingAda002 = 'TextEmbeddingAda002',
  TextModerationLatest = 'TextModerationLatest',
  TextModerationStable = 'TextModerationStable',
}

export interface CopilotPromptConfigInput {
  frequencyPenalty: InputMaybe<Scalars['Float']['input']>;
  jsonMode: InputMaybe<Scalars['Boolean']['input']>;
  presencePenalty: InputMaybe<Scalars['Float']['input']>;
  temperature: InputMaybe<Scalars['Float']['input']>;
  topP: InputMaybe<Scalars['Float']['input']>;
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
  params: InputMaybe<Scalars['JSON']['input']>;
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

export interface CreateChatMessageInput {
  attachments: InputMaybe<Array<Scalars['String']['input']>>;
  blobs: InputMaybe<Array<Scalars['Upload']['input']>>;
  content: InputMaybe<Scalars['String']['input']>;
  params: InputMaybe<Scalars['JSON']['input']>;
  sessionId: Scalars['String']['input'];
}

export interface CreateChatSessionInput {
  docId: Scalars['String']['input'];
  /** The prompt name to use for the session */
  promptName: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface CreateCheckoutSessionInput {
  coupon: InputMaybe<Scalars['String']['input']>;
  idempotencyKey: Scalars['String']['input'];
  plan: InputMaybe<SubscriptionPlan>;
  recurring: InputMaybe<SubscriptionRecurring>;
  successCallbackLink: Scalars['String']['input'];
  variant: InputMaybe<SubscriptionVariant>;
}

export interface CreateCopilotPromptInput {
  action: InputMaybe<Scalars['String']['input']>;
  config: InputMaybe<CopilotPromptConfigInput>;
  messages: Array<CopilotPromptMessageInput>;
  model: CopilotModels;
  name: Scalars['String']['input'];
}

export interface CreateUserInput {
  email: Scalars['String']['input'];
  name: InputMaybe<Scalars['String']['input']>;
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

export interface DocAccessDeniedDataType {
  __typename?: 'DocAccessDeniedDataType';
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

export interface DocNotFoundDataType {
  __typename?: 'DocNotFoundDataType';
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
  | CopilotMessageNotFoundDataType
  | CopilotPromptNotFoundDataType
  | CopilotProviderSideErrorDataType
  | DocAccessDeniedDataType
  | DocHistoryNotFoundDataType
  | DocNotFoundDataType
  | InvalidHistoryTimestampDataType
  | InvalidPasswordLengthDataType
  | InvalidRuntimeConfigTypeDataType
  | MissingOauthQueryParameterDataType
  | NotInSpaceDataType
  | RuntimeConfigNotFoundDataType
  | SameSubscriptionRecurringDataType
  | SpaceAccessDeniedDataType
  | SpaceNotFoundDataType
  | SpaceOwnerNotFoundDataType
  | SubscriptionAlreadyExistsDataType
  | SubscriptionNotExistsDataType
  | SubscriptionPlanNotFoundDataType
  | UnknownOauthProviderDataType
  | VersionRejectedDataType;

export enum ErrorNames {
  ACCESS_DENIED = 'ACCESS_DENIED',
  ACTION_FORBIDDEN = 'ACTION_FORBIDDEN',
  ALREADY_IN_SPACE = 'ALREADY_IN_SPACE',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  BLOB_NOT_FOUND = 'BLOB_NOT_FOUND',
  BLOB_QUOTA_EXCEEDED = 'BLOB_QUOTA_EXCEEDED',
  CANNOT_DELETE_ALL_ADMIN_ACCOUNT = 'CANNOT_DELETE_ALL_ADMIN_ACCOUNT',
  CANNOT_DELETE_OWN_ACCOUNT = 'CANNOT_DELETE_OWN_ACCOUNT',
  CANT_CHANGE_SPACE_OWNER = 'CANT_CHANGE_SPACE_OWNER',
  CANT_UPDATE_ONETIME_PAYMENT_SUBSCRIPTION = 'CANT_UPDATE_ONETIME_PAYMENT_SUBSCRIPTION',
  CAPTCHA_VERIFICATION_FAILED = 'CAPTCHA_VERIFICATION_FAILED',
  COPILOT_ACTION_TAKEN = 'COPILOT_ACTION_TAKEN',
  COPILOT_FAILED_TO_CREATE_MESSAGE = 'COPILOT_FAILED_TO_CREATE_MESSAGE',
  COPILOT_FAILED_TO_GENERATE_TEXT = 'COPILOT_FAILED_TO_GENERATE_TEXT',
  COPILOT_MESSAGE_NOT_FOUND = 'COPILOT_MESSAGE_NOT_FOUND',
  COPILOT_PROMPT_INVALID = 'COPILOT_PROMPT_INVALID',
  COPILOT_PROMPT_NOT_FOUND = 'COPILOT_PROMPT_NOT_FOUND',
  COPILOT_PROVIDER_SIDE_ERROR = 'COPILOT_PROVIDER_SIDE_ERROR',
  COPILOT_QUOTA_EXCEEDED = 'COPILOT_QUOTA_EXCEEDED',
  COPILOT_SESSION_DELETED = 'COPILOT_SESSION_DELETED',
  COPILOT_SESSION_NOT_FOUND = 'COPILOT_SESSION_NOT_FOUND',
  CUSTOMER_PORTAL_CREATE_FAILED = 'CUSTOMER_PORTAL_CREATE_FAILED',
  DOC_ACCESS_DENIED = 'DOC_ACCESS_DENIED',
  DOC_HISTORY_NOT_FOUND = 'DOC_HISTORY_NOT_FOUND',
  DOC_NOT_FOUND = 'DOC_NOT_FOUND',
  EARLY_ACCESS_REQUIRED = 'EARLY_ACCESS_REQUIRED',
  EMAIL_ALREADY_USED = 'EMAIL_ALREADY_USED',
  EMAIL_TOKEN_NOT_FOUND = 'EMAIL_TOKEN_NOT_FOUND',
  EMAIL_VERIFICATION_REQUIRED = 'EMAIL_VERIFICATION_REQUIRED',
  EXPECT_TO_PUBLISH_PAGE = 'EXPECT_TO_PUBLISH_PAGE',
  EXPECT_TO_REVOKE_PUBLIC_PAGE = 'EXPECT_TO_REVOKE_PUBLIC_PAGE',
  FAILED_TO_CHECKOUT = 'FAILED_TO_CHECKOUT',
  FAILED_TO_SAVE_UPDATES = 'FAILED_TO_SAVE_UPDATES',
  FAILED_TO_UPSERT_SNAPSHOT = 'FAILED_TO_UPSERT_SNAPSHOT',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_EMAIL_TOKEN = 'INVALID_EMAIL_TOKEN',
  INVALID_HISTORY_TIMESTAMP = 'INVALID_HISTORY_TIMESTAMP',
  INVALID_OAUTH_CALLBACK_STATE = 'INVALID_OAUTH_CALLBACK_STATE',
  INVALID_PASSWORD_LENGTH = 'INVALID_PASSWORD_LENGTH',
  INVALID_RUNTIME_CONFIG_TYPE = 'INVALID_RUNTIME_CONFIG_TYPE',
  LINK_EXPIRED = 'LINK_EXPIRED',
  MAILER_SERVICE_IS_NOT_CONFIGURED = 'MAILER_SERVICE_IS_NOT_CONFIGURED',
  MEMBER_QUOTA_EXCEEDED = 'MEMBER_QUOTA_EXCEEDED',
  MISSING_OAUTH_QUERY_PARAMETER = 'MISSING_OAUTH_QUERY_PARAMETER',
  NOT_FOUND = 'NOT_FOUND',
  NOT_IN_SPACE = 'NOT_IN_SPACE',
  NO_COPILOT_PROVIDER_AVAILABLE = 'NO_COPILOT_PROVIDER_AVAILABLE',
  OAUTH_ACCOUNT_ALREADY_CONNECTED = 'OAUTH_ACCOUNT_ALREADY_CONNECTED',
  OAUTH_STATE_EXPIRED = 'OAUTH_STATE_EXPIRED',
  PAGE_IS_NOT_PUBLIC = 'PAGE_IS_NOT_PUBLIC',
  PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
  RUNTIME_CONFIG_NOT_FOUND = 'RUNTIME_CONFIG_NOT_FOUND',
  SAME_EMAIL_PROVIDED = 'SAME_EMAIL_PROVIDED',
  SAME_SUBSCRIPTION_RECURRING = 'SAME_SUBSCRIPTION_RECURRING',
  SIGN_UP_FORBIDDEN = 'SIGN_UP_FORBIDDEN',
  SPACE_ACCESS_DENIED = 'SPACE_ACCESS_DENIED',
  SPACE_NOT_FOUND = 'SPACE_NOT_FOUND',
  SPACE_OWNER_NOT_FOUND = 'SPACE_OWNER_NOT_FOUND',
  SUBSCRIPTION_ALREADY_EXISTS = 'SUBSCRIPTION_ALREADY_EXISTS',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_HAS_BEEN_CANCELED = 'SUBSCRIPTION_HAS_BEEN_CANCELED',
  SUBSCRIPTION_NOT_EXISTS = 'SUBSCRIPTION_NOT_EXISTS',
  SUBSCRIPTION_PLAN_NOT_FOUND = 'SUBSCRIPTION_PLAN_NOT_FOUND',
  TOO_MANY_REQUEST = 'TOO_MANY_REQUEST',
  UNKNOWN_OAUTH_PROVIDER = 'UNKNOWN_OAUTH_PROVIDER',
  UNSPLASH_IS_NOT_CONFIGURED = 'UNSPLASH_IS_NOT_CONFIGURED',
  USER_AVATAR_NOT_FOUND = 'USER_AVATAR_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  VERSION_REJECTED = 'VERSION_REJECTED',
  WRONG_SIGN_IN_CREDENTIALS = 'WRONG_SIGN_IN_CREDENTIALS',
  WRONG_SIGN_IN_METHOD = 'WRONG_SIGN_IN_METHOD',
}

/** The type of workspace feature */
export enum FeatureType {
  AIEarlyAccess = 'AIEarlyAccess',
  Admin = 'Admin',
  Copilot = 'Copilot',
  EarlyAccess = 'EarlyAccess',
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

export interface HumanReadableQuotaType {
  __typename?: 'HumanReadableQuotaType';
  blobLimit: Scalars['String']['output'];
  copilotActionLimit: Maybe<Scalars['String']['output']>;
  historyPeriod: Scalars['String']['output'];
  memberLimit: Scalars['String']['output'];
  name: Scalars['String']['output'];
  storageQuota: Scalars['String']['output'];
}

export interface InvalidHistoryTimestampDataType {
  __typename?: 'InvalidHistoryTimestampDataType';
  timestamp: Scalars['String']['output'];
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

export interface InviteUserType {
  __typename?: 'InviteUserType';
  /** User accepted */
  accepted: Scalars['Boolean']['output'];
  /** User avatar url */
  avatarUrl: Maybe<Scalars['String']['output']>;
  /**
   * User email verified
   * @deprecated useless
   */
  createdAt: Maybe<Scalars['DateTime']['output']>;
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
  /** User permission in workspace */
  permission: Permission;
}

export enum InvoiceStatus {
  Draft = 'Draft',
  Open = 'Open',
  Paid = 'Paid',
  Uncollectible = 'Uncollectible',
  Void = 'Void',
}

export interface LimitedUserType {
  __typename?: 'LimitedUserType';
  /** User email */
  email: Scalars['String']['output'];
  /** User password has been set */
  hasPassword: Maybe<Scalars['Boolean']['output']>;
}

export interface ListUserInput {
  first: InputMaybe<Scalars['Int']['input']>;
  skip: InputMaybe<Scalars['Int']['input']>;
}

export interface ManageUserInput {
  /** User email */
  email: InputMaybe<Scalars['String']['input']>;
  /** User name */
  name: InputMaybe<Scalars['String']['input']>;
}

export interface MissingOauthQueryParameterDataType {
  __typename?: 'MissingOauthQueryParameterDataType';
  name: Scalars['String']['output'];
}

export interface Mutation {
  __typename?: 'Mutation';
  acceptInviteById: Scalars['Boolean']['output'];
  addWorkspaceFeature: Scalars['Int']['output'];
  cancelSubscription: UserSubscription;
  changeEmail: UserType;
  changePassword: Scalars['Boolean']['output'];
  /** Cleanup sessions */
  cleanupCopilotSession: Array<Scalars['String']['output']>;
  /** Create change password url */
  createChangePasswordUrl: Scalars['String']['output'];
  /** Create a subscription checkout link of stripe */
  createCheckoutSession: Scalars['String']['output'];
  /** Create a chat message */
  createCopilotMessage: Scalars['String']['output'];
  /** Create a copilot prompt */
  createCopilotPrompt: CopilotPromptType;
  /** Create a chat session */
  createCopilotSession: Scalars['String']['output'];
  /** Create a stripe customer portal to manage payment methods */
  createCustomerPortal: Scalars['String']['output'];
  /** Create a new user */
  createUser: UserType;
  /** Create a new workspace */
  createWorkspace: WorkspaceType;
  deleteAccount: DeleteAccount;
  deleteBlob: Scalars['Boolean']['output'];
  /** Delete a user account */
  deleteUser: DeleteAccount;
  deleteWorkspace: Scalars['Boolean']['output'];
  /** Create a chat session */
  forkCopilotSession: Scalars['String']['output'];
  invite: Scalars['String']['output'];
  leaveWorkspace: Scalars['Boolean']['output'];
  publishPage: WorkspacePage;
  recoverDoc: Scalars['DateTime']['output'];
  /** Remove user avatar */
  removeAvatar: RemoveAvatar;
  removeWorkspaceFeature: Scalars['Int']['output'];
  resumeSubscription: UserSubscription;
  revoke: Scalars['Boolean']['output'];
  /** @deprecated use revokePublicPage */
  revokePage: Scalars['Boolean']['output'];
  revokePublicPage: WorkspacePage;
  sendChangeEmail: Scalars['Boolean']['output'];
  sendChangePasswordEmail: Scalars['Boolean']['output'];
  sendSetPasswordEmail: Scalars['Boolean']['output'];
  sendVerifyChangeEmail: Scalars['Boolean']['output'];
  sendVerifyEmail: Scalars['Boolean']['output'];
  setBlob: Scalars['String']['output'];
  setWorkspaceExperimentalFeature: Scalars['Boolean']['output'];
  /** @deprecated renamed to publishPage */
  sharePage: Scalars['Boolean']['output'];
  /** Update a copilot prompt */
  updateCopilotPrompt: CopilotPromptType;
  updateProfile: UserType;
  /** update server runtime configurable setting */
  updateRuntimeConfig: ServerRuntimeConfigType;
  /** update multiple server runtime configurable settings */
  updateRuntimeConfigs: Array<ServerRuntimeConfigType>;
  updateSubscriptionRecurring: UserSubscription;
  /** Update a user */
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
  sendAcceptMail: InputMaybe<Scalars['Boolean']['input']>;
  workspaceId: Scalars['String']['input'];
}

export interface MutationAddWorkspaceFeatureArgs {
  feature: FeatureType;
  workspaceId: Scalars['String']['input'];
}

export interface MutationCancelSubscriptionArgs {
  idempotencyKey: Scalars['String']['input'];
  plan?: InputMaybe<SubscriptionPlan>;
}

export interface MutationChangeEmailArgs {
  email: Scalars['String']['input'];
  token: Scalars['String']['input'];
}

export interface MutationChangePasswordArgs {
  newPassword: Scalars['String']['input'];
  token: Scalars['String']['input'];
  userId: InputMaybe<Scalars['String']['input']>;
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

export interface MutationCreateCopilotMessageArgs {
  options: CreateChatMessageInput;
}

export interface MutationCreateCopilotPromptArgs {
  input: CreateCopilotPromptInput;
}

export interface MutationCreateCopilotSessionArgs {
  options: CreateChatSessionInput;
}

export interface MutationCreateUserArgs {
  input: CreateUserInput;
}

export interface MutationCreateWorkspaceArgs {
  init: InputMaybe<Scalars['Upload']['input']>;
}

export interface MutationDeleteBlobArgs {
  hash: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationDeleteUserArgs {
  id: Scalars['String']['input'];
}

export interface MutationDeleteWorkspaceArgs {
  id: Scalars['String']['input'];
}

export interface MutationForkCopilotSessionArgs {
  options: ForkChatSessionInput;
}

export interface MutationInviteArgs {
  email: Scalars['String']['input'];
  permission: Permission;
  sendInviteMail: InputMaybe<Scalars['Boolean']['input']>;
  workspaceId: Scalars['String']['input'];
}

export interface MutationLeaveWorkspaceArgs {
  sendLeaveMail: InputMaybe<Scalars['Boolean']['input']>;
  workspaceId: Scalars['String']['input'];
  workspaceName: Scalars['String']['input'];
}

export interface MutationPublishPageArgs {
  mode?: InputMaybe<PublicPageMode>;
  pageId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationRecoverDocArgs {
  guid: Scalars['String']['input'];
  timestamp: Scalars['DateTime']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationRemoveWorkspaceFeatureArgs {
  feature: FeatureType;
  workspaceId: Scalars['String']['input'];
}

export interface MutationResumeSubscriptionArgs {
  idempotencyKey: Scalars['String']['input'];
  plan?: InputMaybe<SubscriptionPlan>;
}

export interface MutationRevokeArgs {
  userId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationRevokePageArgs {
  pageId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationRevokePublicPageArgs {
  pageId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationSendChangeEmailArgs {
  callbackUrl: Scalars['String']['input'];
  email: InputMaybe<Scalars['String']['input']>;
}

export interface MutationSendChangePasswordEmailArgs {
  callbackUrl: Scalars['String']['input'];
  email: InputMaybe<Scalars['String']['input']>;
}

export interface MutationSendSetPasswordEmailArgs {
  callbackUrl: Scalars['String']['input'];
  email: InputMaybe<Scalars['String']['input']>;
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

export interface MutationSetWorkspaceExperimentalFeatureArgs {
  enable: Scalars['Boolean']['input'];
  feature: FeatureType;
  workspaceId: Scalars['String']['input'];
}

export interface MutationSharePageArgs {
  pageId: Scalars['String']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface MutationUpdateCopilotPromptArgs {
  messages: Array<CopilotPromptMessageInput>;
  name: Scalars['String']['input'];
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

export interface MutationUpdateSubscriptionRecurringArgs {
  idempotencyKey: Scalars['String']['input'];
  plan?: InputMaybe<SubscriptionPlan>;
  recurring: SubscriptionRecurring;
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

export enum OAuthProviderType {
  GitHub = 'GitHub',
  Google = 'Google',
  OIDC = 'OIDC',
}

export interface PasswordLimitsType {
  __typename?: 'PasswordLimitsType';
  maxLength: Scalars['Int']['output'];
  minLength: Scalars['Int']['output'];
}

/** User permission in workspace */
export enum Permission {
  Admin = 'Admin',
  Owner = 'Owner',
  Read = 'Read',
  Write = 'Write',
}

/** The mode which the public page default in */
export enum PublicPageMode {
  Edgeless = 'Edgeless',
  Page = 'Page',
}

export interface Query {
  __typename?: 'Query';
  /** @deprecated no more needed */
  checkBlobSize: WorkspaceBlobSizes;
  /** @deprecated use `user.storageUsage` instead */
  collectAllBlobSizes: WorkspaceBlobSizes;
  /** Get current user */
  currentUser: Maybe<UserType>;
  error: ErrorDataUnion;
  /** send workspace invitation */
  getInviteInfo: InvitationType;
  /** Get is owner of workspace */
  isOwner: Scalars['Boolean']['output'];
  /**
   * List blobs of workspace
   * @deprecated use `workspace.blobs` instead
   */
  listBlobs: Array<Scalars['String']['output']>;
  /** List all copilot prompts */
  listCopilotPrompts: Array<CopilotPromptType>;
  listWorkspaceFeatures: Array<WorkspaceType>;
  prices: Array<SubscriptionPrice>;
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
  /** Get all accessible workspaces for current user */
  workspaces: Array<WorkspaceType>;
}

export interface QueryCheckBlobSizeArgs {
  size: Scalars['SafeInt']['input'];
  workspaceId: Scalars['String']['input'];
}

export interface QueryErrorArgs {
  name: ErrorNames;
}

export interface QueryGetInviteInfoArgs {
  inviteId: Scalars['String']['input'];
}

export interface QueryIsOwnerArgs {
  workspaceId: Scalars['String']['input'];
}

export interface QueryListBlobsArgs {
  workspaceId: Scalars['String']['input'];
}

export interface QueryListWorkspaceFeaturesArgs {
  feature: FeatureType;
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

export interface QueryChatHistoriesInput {
  action: InputMaybe<Scalars['Boolean']['input']>;
  fork: InputMaybe<Scalars['Boolean']['input']>;
  limit: InputMaybe<Scalars['Int']['input']>;
  messageOrder: InputMaybe<ChatHistoryOrder>;
  sessionId: InputMaybe<Scalars['String']['input']>;
  sessionOrder: InputMaybe<ChatHistoryOrder>;
  skip: InputMaybe<Scalars['Int']['input']>;
}

export interface QuotaQueryType {
  __typename?: 'QuotaQueryType';
  blobLimit: Scalars['SafeInt']['output'];
  copilotActionLimit: Maybe<Scalars['SafeInt']['output']>;
  historyPeriod: Scalars['SafeInt']['output'];
  humanReadable: HumanReadableQuotaType;
  memberCount: Scalars['SafeInt']['output'];
  memberLimit: Scalars['SafeInt']['output'];
  name: Scalars['String']['output'];
  storageQuota: Scalars['SafeInt']['output'];
  usedSize: Scalars['SafeInt']['output'];
}

export interface RemoveAvatar {
  __typename?: 'RemoveAvatar';
  success: Scalars['Boolean']['output'];
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

export enum SubscriptionVariant {
  EA = 'EA',
  Onetime = 'Onetime',
}

export interface UnknownOauthProviderDataType {
  __typename?: 'UnknownOauthProviderDataType';
  name: Scalars['String']['output'];
}

export interface UpdateUserInput {
  /** User name */
  name: InputMaybe<Scalars['String']['input']>;
}

export interface UpdateWorkspaceInput {
  /** Enable url previous when sharing */
  enableUrlPreview: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  /** is Public workspace */
  public: InputMaybe<Scalars['Boolean']['input']>;
}

export interface UserInvoice {
  __typename?: 'UserInvoice';
  amount: Scalars['Int']['output'];
  createdAt: Scalars['DateTime']['output'];
  currency: Scalars['String']['output'];
  id: Scalars['String']['output'];
  lastPaymentError: Maybe<Scalars['String']['output']>;
  link: Maybe<Scalars['String']['output']>;
  plan: SubscriptionPlan;
  reason: Scalars['String']['output'];
  recurring: SubscriptionRecurring;
  status: InvoiceStatus;
  updatedAt: Scalars['DateTime']['output'];
}

export type UserOrLimitedUser = LimitedUserType | UserType;

export interface UserQuota {
  __typename?: 'UserQuota';
  blobLimit: Scalars['SafeInt']['output'];
  historyPeriod: Scalars['SafeInt']['output'];
  humanReadable: UserQuotaHumanReadable;
  memberLimit: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  storageQuota: Scalars['SafeInt']['output'];
}

export interface UserQuotaHumanReadable {
  __typename?: 'UserQuotaHumanReadable';
  blobLimit: Scalars['String']['output'];
  historyPeriod: Scalars['String']['output'];
  memberLimit: Scalars['String']['output'];
  name: Scalars['String']['output'];
  storageQuota: Scalars['String']['output'];
}

export interface UserSubscription {
  __typename?: 'UserSubscription';
  canceledAt: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  end: Maybe<Scalars['DateTime']['output']>;
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
  invoices: Array<UserInvoice>;
  /** User name */
  name: Scalars['String']['output'];
  quota: Maybe<UserQuota>;
  /** @deprecated use `UserType.subscriptions` */
  subscription: Maybe<UserSubscription>;
  subscriptions: Array<UserSubscription>;
  /** @deprecated use [/api/auth/sign-in?native=true] instead */
  token: TokenType;
}

export interface UserTypeCopilotArgs {
  workspaceId: InputMaybe<Scalars['String']['input']>;
}

export interface UserTypeInvoicesArgs {
  skip: InputMaybe<Scalars['Int']['input']>;
  take?: InputMaybe<Scalars['Int']['input']>;
}

export interface UserTypeSubscriptionArgs {
  plan?: InputMaybe<SubscriptionPlan>;
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

export interface WorkspacePage {
  __typename?: 'WorkspacePage';
  id: Scalars['String']['output'];
  mode: PublicPageMode;
  public: Scalars['Boolean']['output'];
  workspaceId: Scalars['String']['output'];
}

export interface WorkspacePageMeta {
  __typename?: 'WorkspacePageMeta';
  createdAt: Scalars['DateTime']['output'];
  createdBy: Maybe<EditorType>;
  updatedAt: Scalars['DateTime']['output'];
  updatedBy: Maybe<EditorType>;
}

export interface WorkspaceType {
  __typename?: 'WorkspaceType';
  /** Available features of workspace */
  availableFeatures: Array<FeatureType>;
  /** List blobs of workspace */
  blobs: Array<Scalars['String']['output']>;
  /** Blobs size of workspace */
  blobsSize: Scalars['Int']['output'];
  /** Workspace created date */
  createdAt: Scalars['DateTime']['output'];
  /** Enable url previous when sharing */
  enableUrlPreview: Scalars['Boolean']['output'];
  /** Enabled features of workspace */
  features: Array<FeatureType>;
  histories: Array<DocHistoryType>;
  id: Scalars['ID']['output'];
  /** is current workspace initialized */
  initialized: Scalars['Boolean']['output'];
  /** member count of workspace */
  memberCount: Scalars['Int']['output'];
  /** Members of workspace */
  members: Array<InviteUserType>;
  /** Owner of workspace */
  owner: UserType;
  /** Cloud page metadata of workspace */
  pageMeta: WorkspacePageMeta;
  /** Permission of current signed in user in workspace */
  permission: Permission;
  /** is Public workspace */
  public: Scalars['Boolean']['output'];
  /** Get public page of a workspace by page id. */
  publicPage: Maybe<WorkspacePage>;
  /** Public pages of a workspace */
  publicPages: Array<WorkspacePage>;
  /** quota of workspace */
  quota: QuotaQueryType;
  /**
   * Shared pages of workspace
   * @deprecated use WorkspaceType.publicPages
   */
  sharedPages: Array<Scalars['String']['output']>;
}

export interface WorkspaceTypeHistoriesArgs {
  before: InputMaybe<Scalars['DateTime']['input']>;
  guid: Scalars['String']['input'];
  take: InputMaybe<Scalars['Int']['input']>;
}

export interface WorkspaceTypeMembersArgs {
  skip: InputMaybe<Scalars['Int']['input']>;
  take: InputMaybe<Scalars['Int']['input']>;
}

export interface WorkspaceTypePageMetaArgs {
  pageId: Scalars['String']['input'];
}

export interface WorkspaceTypePublicPageArgs {
  pageId: Scalars['String']['input'];
}

export interface TokenType {
  __typename?: 'tokenType';
  refresh: Scalars['String']['output'];
  sessionToken: Maybe<Scalars['String']['output']>;
  token: Scalars['String']['output'];
}

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
  };
};

export type DeleteBlobMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  hash: Scalars['String']['input'];
}>;

export type DeleteBlobMutation = {
  __typename?: 'Mutation';
  deleteBlob: boolean;
};

export type ListBlobsQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type ListBlobsQuery = { __typename?: 'Query'; listBlobs: Array<string> };

export type SetBlobMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  blob: Scalars['Upload']['input'];
}>;

export type SetBlobMutation = { __typename?: 'Mutation'; setBlob: string };

export type CancelSubscriptionMutationVariables = Exact<{
  idempotencyKey: Scalars['String']['input'];
  plan?: InputMaybe<SubscriptionPlan>;
}>;

export type CancelSubscriptionMutation = {
  __typename?: 'Mutation';
  cancelSubscription: {
    __typename?: 'UserSubscription';
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

export type CreateCheckoutSessionMutationVariables = Exact<{
  input: CreateCheckoutSessionInput;
}>;

export type CreateCheckoutSessionMutation = {
  __typename?: 'Mutation';
  createCheckoutSession: string;
};

export type CreateCopilotMessageMutationVariables = Exact<{
  options: CreateChatMessageInput;
}>;

export type CreateCopilotMessageMutation = {
  __typename?: 'Mutation';
  createCopilotMessage: string;
};

export type CreateCopilotSessionMutationVariables = Exact<{
  options: CreateChatSessionInput;
}>;

export type CreateCopilotSessionMutation = {
  __typename?: 'Mutation';
  createCopilotSession: string;
};

export type CreateCustomerPortalMutationVariables = Exact<{
  [key: string]: never;
}>;

export type CreateCustomerPortalMutation = {
  __typename?: 'Mutation';
  createCustomerPortal: string;
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

export type ForkCopilotSessionMutationVariables = Exact<{
  options: ForkChatSessionInput;
}>;

export type ForkCopilotSessionMutation = {
  __typename?: 'Mutation';
  forkCopilotSession: string;
};

export type CredentialsRequirementFragment = {
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

export type GetCopilotHistoriesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId: InputMaybe<Scalars['String']['input']>;
  options: InputMaybe<QueryChatHistoriesInput>;
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

export type GetCopilotHistoryIdsQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  docId: InputMaybe<Scalars['String']['input']>;
  options: InputMaybe<QueryChatHistoriesInput>;
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

export type GetCopilotSessionsQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetCopilotSessionsQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    copilot: {
      __typename?: 'Copilot';
      actions: Array<string>;
      chats: Array<string>;
    };
  } | null;
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

export type GetIsOwnerQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetIsOwnerQuery = { __typename?: 'Query'; isOwner: boolean };

export type GetMemberCountByWorkspaceIdQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetMemberCountByWorkspaceIdQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; memberCount: number };
};

export type GetMembersByWorkspaceIdQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  skip: Scalars['Int']['input'];
  take: Scalars['Int']['input'];
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
      accepted: boolean;
      emailVerified: boolean | null;
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
      __typename?: 'UserQuota';
      humanReadable: {
        __typename?: 'UserQuotaHumanReadable';
        blobLimit: string;
        historyPeriod: string;
        memberLimit: string;
        name: string;
        storageQuota: string;
      };
    } | null;
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

export type GetWorkspaceFeaturesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetWorkspaceFeaturesQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; features: Array<FeatureType> };
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

export type GetWorkspacePublicPageByIdQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
}>;

export type GetWorkspacePublicPageByIdQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    publicPage: {
      __typename?: 'WorkspacePage';
      id: string;
      mode: PublicPageMode;
    } | null;
  };
};

export type GetWorkspacePublicPagesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetWorkspacePublicPagesQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    publicPages: Array<{
      __typename?: 'WorkspacePage';
      id: string;
      mode: PublicPageMode;
    }>;
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
    owner: { __typename?: 'UserType'; id: string };
  }>;
};

export type ListHistoryQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageDocId: Scalars['String']['input'];
  take: InputMaybe<Scalars['Int']['input']>;
  before: InputMaybe<Scalars['DateTime']['input']>;
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
      __typename?: 'UserInvoice';
      id: string;
      status: InvoiceStatus;
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
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
  workspaceName: Scalars['String']['input'];
  sendLeaveMail: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type LeaveWorkspaceMutation = {
  __typename?: 'Mutation';
  leaveWorkspace: boolean;
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
    features: Array<FeatureType>;
    hasPassword: boolean | null;
    emailVerified: boolean;
    avatarUrl: string | null;
  }>;
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
  mode?: InputMaybe<PublicPageMode>;
}>;

export type PublishPageMutation = {
  __typename?: 'Mutation';
  publishPage: {
    __typename?: 'WorkspacePage';
    id: string;
    mode: PublicPageMode;
  };
};

export type QuotaQueryVariables = Exact<{ [key: string]: never }>;

export type QuotaQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    id: string;
    quota: {
      __typename?: 'UserQuota';
      name: string;
      blobLimit: number;
      storageQuota: number;
      historyPeriod: number;
      memberLimit: number;
      humanReadable: {
        __typename?: 'UserQuotaHumanReadable';
        name: string;
        blobLimit: string;
        storageQuota: string;
        historyPeriod: string;
        memberLimit: string;
      };
    } | null;
  } | null;
  collectAllBlobSizes: { __typename?: 'WorkspaceBlobSizes'; size: number };
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
  idempotencyKey: Scalars['String']['input'];
  plan?: InputMaybe<SubscriptionPlan>;
}>;

export type ResumeSubscriptionMutation = {
  __typename?: 'Mutation';
  resumeSubscription: {
    __typename?: 'UserSubscription';
    id: string | null;
    status: SubscriptionStatus;
    nextBillAt: string | null;
    start: string;
    end: string | null;
  };
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
  revokePublicPage: {
    __typename?: 'WorkspacePage';
    id: string;
    mode: PublicPageMode;
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
      __typename?: 'UserSubscription';
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
  idempotencyKey: Scalars['String']['input'];
  plan?: InputMaybe<SubscriptionPlan>;
  recurring: SubscriptionRecurring;
}>;

export type UpdateSubscriptionMutation = {
  __typename?: 'Mutation';
  updateSubscriptionRecurring: {
    __typename?: 'UserSubscription';
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

export type GetEnableUrlPreviewQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetEnableUrlPreviewQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; enableUrlPreview: boolean };
};

export type SetEnableUrlPreviewMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  enableUrlPreview: Scalars['Boolean']['input'];
}>;

export type SetEnableUrlPreviewMutation = {
  __typename?: 'Mutation';
  updateWorkspace: { __typename?: 'WorkspaceType'; id: string };
};

export type EnabledFeaturesQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type EnabledFeaturesQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; features: Array<FeatureType> };
};

export type AvailableFeaturesQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type AvailableFeaturesQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    availableFeatures: Array<FeatureType>;
  };
};

export type SetWorkspaceExperimentalFeatureMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  feature: FeatureType;
  enable: Scalars['Boolean']['input'];
}>;

export type SetWorkspaceExperimentalFeatureMutation = {
  __typename?: 'Mutation';
  setWorkspaceExperimentalFeature: boolean;
};

export type AddWorkspaceFeatureMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  feature: FeatureType;
}>;

export type AddWorkspaceFeatureMutation = {
  __typename?: 'Mutation';
  addWorkspaceFeature: number;
};

export type ListWorkspaceFeaturesQueryVariables = Exact<{
  feature: FeatureType;
}>;

export type ListWorkspaceFeaturesQuery = {
  __typename?: 'Query';
  listWorkspaceFeatures: Array<{
    __typename?: 'WorkspaceType';
    id: string;
    public: boolean;
    createdAt: string;
    memberCount: number;
    features: Array<FeatureType>;
    owner: { __typename?: 'UserType'; id: string };
  }>;
};

export type RemoveWorkspaceFeatureMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  feature: FeatureType;
}>;

export type RemoveWorkspaceFeatureMutation = {
  __typename?: 'Mutation';
  removeWorkspaceFeature: number;
};

export type InviteByEmailMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  email: Scalars['String']['input'];
  permission: Permission;
  sendInviteMail: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type InviteByEmailMutation = { __typename?: 'Mutation'; invite: string };

export type AcceptInviteByInviteIdMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  inviteId: Scalars['String']['input'];
  sendAcceptMail: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type AcceptInviteByInviteIdMutation = {
  __typename?: 'Mutation';
  acceptInviteById: boolean;
};

export type WorkspaceQuotaQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type WorkspaceQuotaQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    quota: {
      __typename?: 'QuotaQueryType';
      name: string;
      blobLimit: number;
      storageQuota: number;
      historyPeriod: number;
      memberLimit: number;
      memberCount: number;
      usedSize: number;
      humanReadable: {
        __typename?: 'HumanReadableQuotaType';
        name: string;
        blobLimit: string;
        storageQuota: string;
        historyPeriod: string;
        memberLimit: string;
      };
    };
  };
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
      name: 'copilotQuotaQuery';
      variables: CopilotQuotaQueryVariables;
      response: CopilotQuotaQuery;
    }
  | {
      name: 'getCopilotHistoriesQuery';
      variables: GetCopilotHistoriesQueryVariables;
      response: GetCopilotHistoriesQuery;
    }
  | {
      name: 'getCopilotHistoryIdsQuery';
      variables: GetCopilotHistoryIdsQueryVariables;
      response: GetCopilotHistoryIdsQuery;
    }
  | {
      name: 'getCopilotSessionsQuery';
      variables: GetCopilotSessionsQueryVariables;
      response: GetCopilotSessionsQuery;
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
      name: 'getInviteInfoQuery';
      variables: GetInviteInfoQueryVariables;
      response: GetInviteInfoQuery;
    }
  | {
      name: 'getIsOwnerQuery';
      variables: GetIsOwnerQueryVariables;
      response: GetIsOwnerQuery;
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
      name: 'getPromptsQuery';
      variables: GetPromptsQueryVariables;
      response: GetPromptsQuery;
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
      name: 'getWorkspaceFeaturesQuery';
      variables: GetWorkspaceFeaturesQueryVariables;
      response: GetWorkspaceFeaturesQuery;
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
      name: 'getWorkspacePublicPageByIdQuery';
      variables: GetWorkspacePublicPageByIdQueryVariables;
      response: GetWorkspacePublicPageByIdQuery;
    }
  | {
      name: 'getWorkspacePublicPagesQuery';
      variables: GetWorkspacePublicPagesQueryVariables;
      response: GetWorkspacePublicPagesQuery;
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
      name: 'listUsersQuery';
      variables: ListUsersQueryVariables;
      response: ListUsersQuery;
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
      name: 'getEnableUrlPreviewQuery';
      variables: GetEnableUrlPreviewQueryVariables;
      response: GetEnableUrlPreviewQuery;
    }
  | {
      name: 'enabledFeaturesQuery';
      variables: EnabledFeaturesQueryVariables;
      response: EnabledFeaturesQuery;
    }
  | {
      name: 'availableFeaturesQuery';
      variables: AvailableFeaturesQueryVariables;
      response: AvailableFeaturesQuery;
    }
  | {
      name: 'listWorkspaceFeaturesQuery';
      variables: ListWorkspaceFeaturesQueryVariables;
      response: ListWorkspaceFeaturesQuery;
    }
  | {
      name: 'workspaceQuotaQuery';
      variables: WorkspaceQuotaQueryVariables;
      response: WorkspaceQuotaQuery;
    };

export type Mutations =
  | {
      name: 'deleteBlobMutation';
      variables: DeleteBlobMutationVariables;
      response: DeleteBlobMutation;
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
      name: 'cleanupCopilotSessionMutation';
      variables: CleanupCopilotSessionMutationVariables;
      response: CleanupCopilotSessionMutation;
    }
  | {
      name: 'createCheckoutSessionMutation';
      variables: CreateCheckoutSessionMutationVariables;
      response: CreateCheckoutSessionMutation;
    }
  | {
      name: 'createCopilotMessageMutation';
      variables: CreateCopilotMessageMutationVariables;
      response: CreateCopilotMessageMutation;
    }
  | {
      name: 'createCopilotSessionMutation';
      variables: CreateCopilotSessionMutationVariables;
      response: CreateCopilotSessionMutation;
    }
  | {
      name: 'createCustomerPortalMutation';
      variables: CreateCustomerPortalMutationVariables;
      response: CreateCustomerPortalMutation;
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
      name: 'forkCopilotSessionMutation';
      variables: ForkCopilotSessionMutationVariables;
      response: ForkCopilotSessionMutation;
    }
  | {
      name: 'leaveWorkspaceMutation';
      variables: LeaveWorkspaceMutationVariables;
      response: LeaveWorkspaceMutation;
    }
  | {
      name: 'publishPageMutation';
      variables: PublishPageMutationVariables;
      response: PublishPageMutation;
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
      name: 'updatePromptMutation';
      variables: UpdatePromptMutationVariables;
      response: UpdatePromptMutation;
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
      name: 'setEnableUrlPreviewMutation';
      variables: SetEnableUrlPreviewMutationVariables;
      response: SetEnableUrlPreviewMutation;
    }
  | {
      name: 'setWorkspaceExperimentalFeatureMutation';
      variables: SetWorkspaceExperimentalFeatureMutationVariables;
      response: SetWorkspaceExperimentalFeatureMutation;
    }
  | {
      name: 'addWorkspaceFeatureMutation';
      variables: AddWorkspaceFeatureMutationVariables;
      response: AddWorkspaceFeatureMutation;
    }
  | {
      name: 'removeWorkspaceFeatureMutation';
      variables: RemoveWorkspaceFeatureMutationVariables;
      response: RemoveWorkspaceFeatureMutation;
    }
  | {
      name: 'inviteByEmailMutation';
      variables: InviteByEmailMutationVariables;
      response: InviteByEmailMutation;
    }
  | {
      name: 'acceptInviteByInviteIdMutation';
      variables: AcceptInviteByInviteIdMutationVariables;
      response: AcceptInviteByInviteIdMutation;
    };
