import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import {
  getWorkspaceDetail,
  updateWorkspace,
  deleteWorkspace,
  inviteMember,
  Workspace,
} from './workspace';
import {
  GetWorkspaceDetailParams,
  WorkspaceDetail,
  UpdateWorkspaceParams,
  DeleteWorkspaceParams,
  InviteMemberParams,
  getWorkspaces,
} from './workspace';

export const GET_WORKSPACE_DETAIL_SWR_TOKEN = 'workspace.getWorkspaceDetail';
export function useGetWorkspaceDetail(
  params: GetWorkspaceDetailParams,
  config?: SWRConfiguration
) {
  const { data, error, isLoading, mutate } = useSWR<WorkspaceDetail | null>(
    [GET_WORKSPACE_DETAIL_SWR_TOKEN, params],
    ([_, params]) => getWorkspaceDetail(params),
    config
  );

  return {
    data,
    error,
    loading: isLoading,
    mutate,
  };
}

export const GET_WORKSPACES_SWR_TOKEN = 'workspace.getWorkspaces';
export function useGetWorkspaces(config?: SWRConfiguration) {
  const { data, error, isLoading } = useSWR<Workspace[]>(
    [GET_WORKSPACES_SWR_TOKEN],
    () => getWorkspaces(),
    config
  );

  return {
    data,
    error,
    loading: isLoading,
  };
}

export const UPDATE_WORKSPACE_SWR_TOKEN = 'workspace.updateWorkspace';
/**
 * I don't think a hook needed for update workspace.
 * If you figure out the scene, please implement this function.
 */
export function useUpdateWorkspace() {}

export const DELETE_WORKSPACE_SWR_TOKEN = 'workspace.deleteWorkspace';
/**
 * I don't think a hook needed for delete workspace.
 * If you figure out the scene, please implement this function.
 */
export function useDeleteWorkspace() {}

export const INVITE_MEMBER_SWR_TOKEN = 'workspace.inviteMember';
/**
 * I don't think a hook needed for invite member.
 * If you figure out the scene, please implement this function.
 */
export function useInviteMember() {}
