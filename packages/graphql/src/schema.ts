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
  /** The `Upload` scalar type represents a file upload. */
  Upload: { input: File; output: File };
}

export enum NewFeaturesKind {
  EarlyAccess = 'EarlyAccess',
}

/** User permission in workspace */
export enum Permission {
  Admin = 'Admin',
  Owner = 'Owner',
  Read = 'Read',
  Write = 'Write',
}

export interface UpdateWorkspaceInput {
  id: Scalars['ID']['input'];
  /** is Public workspace */
  public: InputMaybe<Scalars['Boolean']['input']>;
}

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
  collectBlobSizes: { __typename?: 'WorkspaceBlobSizes'; size: number };
};

export type ChangeEmailMutationVariables = Exact<{
  id: Scalars['String']['input'];
  newEmail: Scalars['String']['input'];
}>;

export type ChangeEmailMutation = {
  __typename?: 'Mutation';
  changeEmail: {
    __typename?: 'UserType';
    id: string;
    name: string;
    avatarUrl: string | null;
    email: string;
  };
};

export type ChangePasswordMutationVariables = Exact<{
  id: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
}>;

export type ChangePasswordMutation = {
  __typename?: 'Mutation';
  changePassword: {
    __typename?: 'UserType';
    id: string;
    name: string;
    avatarUrl: string | null;
    email: string;
  };
};

export type CreateWorkspaceMutationVariables = Exact<{
  init: Scalars['Upload']['input'];
}>;

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

export type GetCurrentUserQueryVariables = Exact<{ [key: string]: never }>;

export type GetCurrentUserQuery = {
  __typename?: 'Query';
  currentUser: {
    __typename?: 'UserType';
    id: string;
    name: string;
    email: string;
    emailVerified: string | null;
    avatarUrl: string | null;
    createdAt: string | null;
    token: { __typename?: 'TokenType'; token: string };
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

export type GetIsOwnerQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetIsOwnerQuery = { __typename?: 'Query'; isOwner: boolean };

export type GetMembersByWorkspaceIdQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
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
      emailVerified: string | null;
    }>;
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
  user: {
    __typename?: 'UserType';
    id: string;
    name: string;
    avatarUrl: string | null;
    email: string;
    hasPassword: boolean | null;
  } | null;
};

export type GetWorkspacePublicByIdQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetWorkspacePublicByIdQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; public: boolean };
};

export type GetWorkspaceSharedPagesQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetWorkspaceSharedPagesQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; sharedPages: Array<string> };
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

export type LeaveWorkspaceMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type LeaveWorkspaceMutation = {
  __typename?: 'Mutation';
  leaveWorkspace: boolean;
};

export type RevokeMemberPermissionMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  userId: Scalars['String']['input'];
}>;

export type RevokeMemberPermissionMutation = {
  __typename?: 'Mutation';
  revoke: boolean;
};

export type RevokePageMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
}>;

export type RevokePageMutation = {
  __typename?: 'Mutation';
  revokePage: boolean;
};

export type SendChangeEmailMutationVariables = Exact<{
  email: Scalars['String']['input'];
  callbackUrl: Scalars['String']['input'];
}>;

export type SendChangeEmailMutation = {
  __typename?: 'Mutation';
  sendChangeEmail: boolean;
};

export type SendChangePasswordEmailMutationVariables = Exact<{
  email: Scalars['String']['input'];
  callbackUrl: Scalars['String']['input'];
}>;

export type SendChangePasswordEmailMutation = {
  __typename?: 'Mutation';
  sendChangePasswordEmail: boolean;
};

export type SendSetPasswordEmailMutationVariables = Exact<{
  email: Scalars['String']['input'];
  callbackUrl: Scalars['String']['input'];
}>;

export type SendSetPasswordEmailMutation = {
  __typename?: 'Mutation';
  sendSetPasswordEmail: boolean;
};

export type SetRevokePageMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
}>;

export type SetRevokePageMutation = {
  __typename?: 'Mutation';
  revokePage: boolean;
};

export type SetSharePageMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
}>;

export type SetSharePageMutation = {
  __typename?: 'Mutation';
  sharePage: boolean;
};

export type SetWorkspacePublicByIdMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  public: Scalars['Boolean']['input'];
}>;

export type SetWorkspacePublicByIdMutation = {
  __typename?: 'Mutation';
  updateWorkspace: { __typename?: 'WorkspaceType'; id: string };
};

export type SharePageMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  pageId: Scalars['String']['input'];
}>;

export type SharePageMutation = { __typename?: 'Mutation'; sharePage: boolean };

export type SignInMutationVariables = Exact<{
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
}>;

export type SignInMutation = {
  __typename?: 'Mutation';
  signIn: {
    __typename?: 'UserType';
    token: { __typename?: 'TokenType'; token: string };
  };
};

export type SignUpMutationVariables = Exact<{
  name: Scalars['String']['input'];
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
}>;

export type SignUpMutation = {
  __typename?: 'Mutation';
  signUp: {
    __typename?: 'UserType';
    token: { __typename?: 'TokenType'; token: string };
  };
};

export type UploadAvatarMutationVariables = Exact<{
  id: Scalars['String']['input'];
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
}>;

export type AcceptInviteByInviteIdMutation = {
  __typename?: 'Mutation';
  acceptInviteById: boolean;
};

export type AcceptInviteByWorkspaceIdMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type AcceptInviteByWorkspaceIdMutation = {
  __typename?: 'Mutation';
  acceptInvite: boolean;
};

export type Queries =
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
      name: 'getMembersByWorkspaceIdQuery';
      variables: GetMembersByWorkspaceIdQueryVariables;
      response: GetMembersByWorkspaceIdQuery;
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
      name: 'getWorkspacePublicByIdQuery';
      variables: GetWorkspacePublicByIdQueryVariables;
      response: GetWorkspacePublicByIdQuery;
    }
  | {
      name: 'getWorkspaceSharedPagesQuery';
      variables: GetWorkspaceSharedPagesQueryVariables;
      response: GetWorkspaceSharedPagesQuery;
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
      name: 'leaveWorkspaceMutation';
      variables: LeaveWorkspaceMutationVariables;
      response: LeaveWorkspaceMutation;
    }
  | {
      name: 'revokeMemberPermissionMutation';
      variables: RevokeMemberPermissionMutationVariables;
      response: RevokeMemberPermissionMutation;
    }
  | {
      name: 'revokePageMutation';
      variables: RevokePageMutationVariables;
      response: RevokePageMutation;
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
      name: 'setRevokePageMutation';
      variables: SetRevokePageMutationVariables;
      response: SetRevokePageMutation;
    }
  | {
      name: 'setSharePageMutation';
      variables: SetSharePageMutationVariables;
      response: SetSharePageMutation;
    }
  | {
      name: 'setWorkspacePublicByIdMutation';
      variables: SetWorkspacePublicByIdMutationVariables;
      response: SetWorkspacePublicByIdMutation;
    }
  | {
      name: 'sharePageMutation';
      variables: SharePageMutationVariables;
      response: SharePageMutation;
    }
  | {
      name: 'signInMutation';
      variables: SignInMutationVariables;
      response: SignInMutation;
    }
  | {
      name: 'signUpMutation';
      variables: SignUpMutationVariables;
      response: SignUpMutation;
    }
  | {
      name: 'uploadAvatarMutation';
      variables: UploadAvatarMutationVariables;
      response: UploadAvatarMutation;
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
    }
  | {
      name: 'acceptInviteByWorkspaceIdMutation';
      variables: AcceptInviteByWorkspaceIdMutationVariables;
      response: AcceptInviteByWorkspaceIdMutation;
    };
