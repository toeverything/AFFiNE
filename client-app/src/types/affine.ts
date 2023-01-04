/**
 * Copied from packages/data-services/src/sdks/workspace.ts
 * // TODO: after it published, use that package
 */
export enum WorkspaceType {
  Private = 0,
  Normal = 1,
}
export enum PermissionType {
  Read = 0,
  Write = 1,
  Admin = 2,
  Owner = 3,
}
export interface Workspace {
  avatar: string;
  id: number;
  create_at: number;
  name: string;
  permission_type: PermissionType;
  public: boolean;
  type: WorkspaceType;
}
