import type {
  AdminUpdateWorkspaceMutation,
  AdminWorkspaceQuery,
  AdminWorkspacesQuery,
  FeatureType,
} from '@affine/graphql';

export type WorkspaceListItem = AdminWorkspacesQuery['adminWorkspaces'][0];
export type WorkspaceDetail = NonNullable<
  AdminWorkspaceQuery['adminWorkspace']
>;
export type WorkspaceMember = WorkspaceDetail['members'][0];
export type WorkspaceSharedLink = WorkspaceDetail['sharedLinks'][0];

export type WorkspaceUpdateInput =
  AdminUpdateWorkspaceMutation['adminUpdateWorkspace'];

export type WorkspaceFeatureFilter = FeatureType[];

export type WorkspaceFlagFilter = {
  public?: boolean;
  enableAi?: boolean;
  enableSharing?: boolean;
  enableUrlPreview?: boolean;
  enableDocEmbedding?: boolean;
};
