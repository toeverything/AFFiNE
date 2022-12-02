import useSWR, { SWRConfiguration } from 'swr';
import { request, ServiceError } from '../request';
import type {
  RequestInviteCollaborator,
  ResponseInviteCollaborator,
} from './types';

const COLLABORATOR_INVITE_URL = '/api/account/invite';

async function inviteCollaboratorFetcher(
  url: string,
  req: RequestInviteCollaborator
) {
  const { data } = await request.post<ResponseInviteCollaborator>(url, req);
  return data;
}

export async function inviteCollaborator(req: RequestInviteCollaborator) {
  return await inviteCollaboratorFetcher(COLLABORATOR_INVITE_URL, req);
}

export function useInviteCollaborator(
  req: RequestInviteCollaborator,
  config?: SWRConfiguration
) {
  const { data, error } = useSWR<ResponseInviteCollaborator, ServiceError>(
    [COLLABORATOR_INVITE_URL, req],
    inviteCollaboratorFetcher,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}
