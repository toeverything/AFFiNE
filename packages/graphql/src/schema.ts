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
/** All built-in and custom scalars, mapped to their actual values */
export interface Scalars {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  /** A date-time string at UTC, such as 2019-12-03T09:54:33Z, compliant with the date-time format. */
  DateTime: string;
}

/** Workspace type */
export enum WorkspaceType {
  /** Normal workspace */
  Normal = 'Normal',
  /** Private workspace */
  Private = 'Private',
}

export type CreateWorkspaceMutationVariables = Exact<{ [key: string]: never }>;

export type CreateWorkspaceMutation = {
  __typename?: 'Mutation';
  createWorkspace: {
    __typename?: 'Workspace';
    id: string;
    public: boolean;
    created_at: string;
  };
};

export type WorkspaceByIdQueryVariables = Exact<{
  id: Scalars['String'];
}>;

export type WorkspaceByIdQuery = {
  __typename?: 'Query';
  workspace: {
    __typename?: 'Workspace';
    id: string;
    type: WorkspaceType;
    public: boolean;
    created_at: string;
  };
};

export type Queries = {
  name: 'workspaceByIdQuery';
  variables: WorkspaceByIdQueryVariables;
  response: WorkspaceByIdQuery;
};

export type Mutations = {
  name: 'createWorkspaceMutation';
  variables: CreateWorkspaceMutationVariables;
  response: CreateWorkspaceMutation;
};
