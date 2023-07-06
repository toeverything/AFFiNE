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

export type AcceptInviteByWorkspaceIdMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type AcceptInviteByWorkspaceIdMutation = {
  __typename?: 'Mutation';
  acceptInvite: boolean;
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

export type DeleteWorkspaceMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type DeleteWorkspaceMutation = {
  __typename?: 'Mutation';
  deleteWorkspace: boolean;
};

export type GetMembersByWorkspaceIdQueryVariables = Exact<{
  workspaceId: Scalars['String']['input'];
}>;

export type GetMembersByWorkspaceIdQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'WorkspaceType';
    members: Array<{
      __typename?: 'UserType';
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    }>;
  };
};

export type GetWorkspacePublicByIdQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type GetWorkspacePublicByIdQuery = {
  __typename?: 'Query';
  workspace: { __typename?: 'WorkspaceType'; public: boolean };
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

export type InviteByEmailMutationVariables = Exact<{
  workspaceId: Scalars['String']['input'];
  email: Scalars['String']['input'];
  permission: Permission;
}>;

export type InviteByEmailMutation = {
  __typename?: 'Mutation';
  invite: boolean;
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

export type Queries =
  | {
      name: 'getMembersByWorkspaceIdQuery';
      variables: GetMembersByWorkspaceIdQueryVariables;
      response: GetMembersByWorkspaceIdQuery;
    }
  | {
      name: 'getWorkspacePublicByIdQuery';
      variables: GetWorkspacePublicByIdQueryVariables;
      response: GetWorkspacePublicByIdQuery;
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
      name: 'acceptInviteByWorkspaceIdMutation';
      variables: AcceptInviteByWorkspaceIdMutationVariables;
      response: AcceptInviteByWorkspaceIdMutation;
    }
  | {
      name: 'createWorkspaceMutation';
      variables: CreateWorkspaceMutationVariables;
      response: CreateWorkspaceMutation;
    }
  | {
      name: 'deleteWorkspaceMutation';
      variables: DeleteWorkspaceMutationVariables;
      response: DeleteWorkspaceMutation;
    }
  | {
      name: 'inviteByEmailMutation';
      variables: InviteByEmailMutationVariables;
      response: InviteByEmailMutation;
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
      name: 'uploadAvatarMutation';
      variables: UploadAvatarMutationVariables;
      response: UploadAvatarMutation;
    };
