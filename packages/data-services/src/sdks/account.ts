import useSWR, { SWRConfiguration } from 'swr';
import { request, ServiceError } from '../request';
import type {
  RequestAcceptInviting,
  RequestInviteCollaborator,
  RequestRemoveCollaborator,
  ResponseInviteCollaborator,
} from './types';

const COLLABORATOR_INVITE_URL = '/api/account/invite';
const REMOVE_COLLABORATOR_URL = '/api/account/remove_collaborator';

async function doInviteCollaborator(
  url: string,
  req: RequestInviteCollaborator
) {
  const { data } = await request.post<ResponseInviteCollaborator>(url, req);
  return data;
}

export async function inviteCollaborator(req: RequestInviteCollaborator) {
  return await doInviteCollaborator(COLLABORATOR_INVITE_URL, req);
}

async function doRemoveCollaborator(
  url: string,
  req: RequestRemoveCollaborator
) {
  return request.post(url, req);
}

export async function removeCollaborator(req: RequestRemoveCollaborator) {
  return await doRemoveCollaborator(REMOVE_COLLABORATOR_URL, req);
}

function doAcceptInviting(url: string, req: RequestAcceptInviting) {
  return request.post(url, req);
}

export async function acceptInviting(req: RequestAcceptInviting) {
  return await doAcceptInviting(COLLABORATOR_INVITE_URL, req);
}

export function useInviteCollaborator(
  req: RequestInviteCollaborator,
  config?: SWRConfiguration
) {
  const { data, error } = useSWR<ResponseInviteCollaborator, ServiceError>(
    [COLLABORATOR_INVITE_URL, req],
    doInviteCollaborator,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}

export function useRemoveCollaborator(
  req: RequestRemoveCollaborator,
  config?: SWRConfiguration
) {
  const { data, error } = useSWR<unknown, ServiceError>(
    [REMOVE_COLLABORATOR_URL, req],
    doRemoveCollaborator,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}

export function useAcceptInviting(
  req: RequestAcceptInviting,
  config?: SWRConfiguration
) {
  const { data, error } = useSWR<unknown, ServiceError>(
    [COLLABORATOR_INVITE_URL, req],
    doAcceptInviting,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}
