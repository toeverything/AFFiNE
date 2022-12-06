import useSWR, { SWRConfiguration } from 'swr';
import type {
  MayError,
  RequestCreateWorkspace,
  RequestUpdateWorkspace,
  ResponseCreateWorkspace,
  ResponseGetWorkspaces,
} from './types';
import { request, ServiceError } from '../request';

const WORKSPACE_URL = '/api/workspace';

async function doGetWorkSpaces(url: string) {
  const { data } = await request.get<ResponseGetWorkspaces>(url);
  return data;
}

export async function getWorkSpaces() {
  return await doGetWorkSpaces(WORKSPACE_URL);
}

async function doCreateWorkspace(url: string, req: RequestCreateWorkspace) {
  const { data } = await request.put<ResponseCreateWorkspace>(url, req);
  return data;
}

export async function createWorkspace(req: RequestCreateWorkspace) {
  doCreateWorkspace(WORKSPACE_URL, req);
}

async function doUpdateWorkspace(url: string, req: RequestUpdateWorkspace) {
  const { data } = await request.post<MayError>(url, req);
  return data;
}

export function updateWorkspace(id: string, req: RequestUpdateWorkspace) {
  return doUpdateWorkspace(`${WORKSPACE_URL}${id}`, req);
}

async function doDeleteWorkspace(url: string) {
  const { data } = await request.delete<MayError>(url);
  return data;
}

export function deleteWorkspace(id: string) {
  return doDeleteWorkspace(`${WORKSPACE_URL}${id}`);
}

export function useGetWorkspaces(config?: SWRConfiguration) {
  const { data, error } = useSWR<ResponseGetWorkspaces, ServiceError, string>(
    WORKSPACE_URL,
    doGetWorkSpaces,
    config
  );
  return {
    data,
    isLoading: !data,
    isError: data && !error,
  };
}

export function useCreateWorkspace(
  req: RequestCreateWorkspace,
  config?: SWRConfiguration
) {
  const { data, error } = useSWR<ResponseGetWorkspaces, ServiceError>(
    [WORKSPACE_URL, req],
    doCreateWorkspace,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}

export function useUpdateWorkspace(
  id: string,
  req: RequestCreateWorkspace,
  config?: SWRConfiguration
) {
  const { data, error } = useSWR<MayError, ServiceError>(
    [`${WORKSPACE_URL}${id}`, req],
    doUpdateWorkspace,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}

export function useDeleteWorkspace(id: string, config?: SWRConfiguration) {
  const { data, error } = useSWR<MayError, ServiceError>(
    `${WORKSPACE_URL}${id}`,
    doDeleteWorkspace,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}
