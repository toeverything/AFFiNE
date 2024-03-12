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
  /** The `SafeInt` scalar type represents non-fractional signed whole numeric values that are considered safe as defined by the ECMAScript specification. */
  SafeInt: { input: number; output: number };
  /** The `Upload` scalar type represents a file upload. */
  Upload: { input: File; output: File };
}

export interface CreateCheckoutSessionInput {
  coupon: InputMaybe<Scalars['String']['input']>;
  idempotencyKey: Scalars['String']['input'];
  plan: InputMaybe<SubscriptionPlan>;
  recurring: InputMaybe<SubscriptionRecurring>;
  successCallbackLink: InputMaybe<Scalars['String']['input']>;
}

/** The type of workspace feature */
export enum FeatureType {
  Copilot = 'Copilot',
  EarlyAccess = 'EarlyAccess',
  UnlimitedWorkspace = 'UnlimitedWorkspace',
}

export enum InvoiceStatus {
  Draft = 'Draft',
  Open = 'Open',
  Paid = 'Paid',
  Uncollectible = 'Uncollectible',
  Void = 'Void',
}

export enum OAuthProviderType {
  GitHub = 'GitHub',
  Google = 'Google',
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

export enum ServerDeploymentType {
  Affine = 'Affine',
  Selfhosted = 'Selfhosted',
}

export enum ServerFeature {
  OAuth = 'OAuth',
  Payment = 'Payment',
}

export enum SubscriptionPlan {
  Enterprise = 'Enterprise',
  Free = 'Free',
  Pro = 'Pro',
  SelfHosted = 'SelfHosted',
  Team = 'Team',
}

export enum SubscriptionRecurring {
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

export interface UpdateUserInput {
  /** User name */
  name: InputMaybe<Scalars['String']['input']>;
}

export interface UpdateWorkspaceInput {
  id: Scalars['ID']['input'];
  /** is Public workspace */
  public: InputMaybe<Scalars['Boolean']['input']>;
}

export type CheckBlobSizesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  size: Scalars['SafeInt']['input'];
}>;

export type CheckBlobSizesQuery = {
  __typename?: 'Query';
  checkBlobSize: { __typename?: 'WorkspaceBlobSizes'; size: number };
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

export type BlobSizesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type BlobSizesQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; blobsSize: number };
};

export type AllBlobSizesQueryVariables = Exact<{ [key: string]: never }>;

export type AllBlobSizesQuery = {
  __typename?: 'Query';
  collectAllBlobSizes: { __typename?: 'WorkspaceBlobSizes'; size: number };
};

export type CancelSubscriptionMutationVariables = Exact<{
  idempotencyKey: Scalars['String']['input'];
}>;

export type CancelSubscriptionMutation = {
  __typename?: 'Mutation';
  cancelSubscription: {
    __typename?: 'UserSubscription';
    id: string;
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

export type ChangePasswordMutationVariables = Exact<{
  token: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
}>;

export type ChangePasswordMutation = {
  __typename?: 'Mutation';
  changePassword: { __typename?: 'UserType'; id: string };
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

export type DeleteWorkspaceMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type DeleteWorkspaceMutation = {
  __typename?: 'Mutation';
  deleteWorkspace: boolean;
};

export type AddToEarlyAccessMutationVariables = Exact<{
  email: Scalars['String']['input'];
}>;

export type AddToEarlyAccessMutation = {
  __typename?: 'Mutation';
  addToEarlyAccess: number;
};

export type EarlyAccessUsersQueryVariables = Exact<{ [key: string]: never }>;

export type EarlyAccessUsersQuery = {
  __typename?: 'Query';
  earlyAccessUsers: Array<{
    __typename?: 'UserType';
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    subscription: {
      __typename?: 'UserSubscription';
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
      status: SubscriptionStatus;
      start: string;
      end: string;
    } | null;
  }>;
};

export type RemoveEarlyAccessMutationVariables = Exact<{
  email: Scalars['String']['input'];
}>;

export type RemoveEarlyAccessMutation = {
  __typename?: 'Mutation';
  removeEarlyAccess: number;
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

export type GetPublicWorkspaceQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetPublicWorkspaceQuery = {
  __typename?: 'Query';
  publicWorkspace: { __typename?: 'WorkspaceType'; id: string };
};

export type GetUserQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;

export type GetUserQuery = {
  __typename?: 'Query';
  user:
    | { __typename: 'LimitedUserType'; email: string; hasPassword: boolean }
    | {
        __typename: 'UserType';
        id: string;
        name: string;
        avatarUrl: string | null;
        email: string;
        hasPassword: boolean;
      }
    | null;
};

export type GetWorkspaceFeaturesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetWorkspaceFeaturesQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; features: Array<FeatureType> };
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
  workspaces: Array<{ __typename?: 'WorkspaceType'; id: string }>;
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

export type PricesQueryVariables = Exact<{ [key: string]: never }>;

export type PricesQuery = {
  __typename?: 'Query';
  prices: Array<{
    __typename?: 'SubscriptionPrice';
    type: string;
    plan: SubscriptionPlan;
    currency: string;
    amount: number;
    yearlyAmount: number;
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
}>;

export type ResumeSubscriptionMutation = {
  __typename?: 'Mutation';
  resumeSubscription: {
    __typename?: 'UserSubscription';
    id: string;
    status: SubscriptionStatus;
    nextBillAt: string | null;
    start: string;
    end: string;
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
    subscription: {
      __typename?: 'UserSubscription';
      id: string;
      status: SubscriptionStatus;
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
      start: string;
      end: string;
      nextBillAt: string | null;
      canceledAt: string | null;
    } | null;
  } | null;
};

export type UpdateSubscriptionMutationVariables = Exact<{
  recurring: SubscriptionRecurring;
  idempotencyKey: Scalars['String']['input'];
}>;

export type UpdateSubscriptionMutation = {
  __typename?: 'Mutation';
  updateSubscriptionRecurring: {
    __typename?: 'UserSubscription';
    id: string;
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
      name: 'checkBlobSizesQuery';
      variables: CheckBlobSizesQueryVariables;
      response: CheckBlobSizesQuery;
    }
  | {
      name: 'listBlobsQuery';
      variables: ListBlobsQueryVariables;
      response: ListBlobsQuery;
    }
  | {
      name: 'blobSizesQuery';
      variables: BlobSizesQueryVariables;
      response: BlobSizesQuery;
    }
  | {
      name: 'allBlobSizesQuery';
      variables: AllBlobSizesQueryVariables;
      response: AllBlobSizesQuery;
    }
  | {
      name: 'earlyAccessUsersQuery';
      variables: EarlyAccessUsersQueryVariables;
      response: EarlyAccessUsersQuery;
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
      name: 'getPublicWorkspaceQuery';
      variables: GetPublicWorkspaceQueryVariables;
      response: GetPublicWorkspaceQuery;
    }
  | {
      name: 'getUserQuery';
      variables: GetUserQueryVariables;
      response: GetUserQuery;
    }
  | {
      name: 'getWorkspaceFeaturesQuery';
      variables: GetWorkspaceFeaturesQueryVariables;
      response: GetWorkspaceFeaturesQuery;
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
      name: 'changePasswordMutation';
      variables: ChangePasswordMutationVariables;
      response: ChangePasswordMutation;
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
      name: 'deleteWorkspaceMutation';
      variables: DeleteWorkspaceMutationVariables;
      response: DeleteWorkspaceMutation;
    }
  | {
      name: 'addToEarlyAccessMutation';
      variables: AddToEarlyAccessMutationVariables;
      response: AddToEarlyAccessMutation;
    }
  | {
      name: 'removeEarlyAccessMutation';
      variables: RemoveEarlyAccessMutationVariables;
      response: RemoveEarlyAccessMutation;
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
