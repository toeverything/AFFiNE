/**
 * @deprecated Remove this file after we migrate to the new cloud.
 */
import { z } from 'zod';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  create_at: string;
}

export interface GetUserByEmailParams {
  email: string;
  workspace_id: string;
}

export const usageResponseSchema = z.object({
  blob_usage: z.object({
    usage: z.number(),
    max_usage: z.number(),
  }),
});

export type UsageResponse = z.infer<typeof usageResponseSchema>;

export interface GetWorkspaceDetailParams {
  id: string;
}

export enum WorkspaceType {
  Private = 0,
  Normal = 1,
}

export enum PermissionType {
  Read = 0,
  Write = 1,
  Admin = 10,
  Owner = 99,
}

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatar_url: z.string(),
  created_at: z.number(),
});

export const workspaceSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(WorkspaceType),
  public: z.boolean(),
  permission: z.nativeEnum(PermissionType),
});

export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceDetailSchema = z.object({
  ...workspaceSchema.shape,
  permission: z.undefined(),
  owner: userSchema,
  member_count: z.number(),
});

export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>;

export interface Permission {
  id: string;
  type: PermissionType;
  workspace_id: string;
  user_id: string;
  user_email: string;
  accepted: boolean;
  create_at: number;
}

export interface RegisteredUser extends User {
  type: 'Registered';
}

export interface UnregisteredUser {
  type: 'Unregistered';
  email: string;
}

export interface Member extends Permission {
  user: RegisteredUser | UnregisteredUser;
}

export interface GetWorkspaceMembersParams {
  id: string;
}

export interface CreateWorkspaceParams {
  name: string;
}

export interface UpdateWorkspaceParams {
  id: string;
  public: boolean;
}

export interface DeleteWorkspaceParams {
  id: string;
}

export interface InviteMemberParams {
  id: string;
  email: string;
}

export interface RemoveMemberParams {
  permissionId: number;
}

export interface AcceptInvitingParams {
  invitingCode: string;
}

export interface LeaveWorkspaceParams {
  id: number | string;
}

export const createWorkspaceResponseSchema = z.object({
  id: z.string(),
  public: z.boolean(),
  type: z.nativeEnum(WorkspaceType),
  created_at: z.number(),
});
