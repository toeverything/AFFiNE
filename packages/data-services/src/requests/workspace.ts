import useSWR, { SWRConfiguration } from 'swr';
import type {
  MayError,
  RequestCreateWorkspace,
  RequestUpdateWorkspace,
  ResponseCreateWorkspace,
  ResponseGetWorkspaces,
  ServicesError,
} from './types';
import axios from './axios';

const WORKSPACE_URL = '/api/workspace';

async function getWorkSpacesFetcher(url: string) {
  const { data } = await axios.get<ResponseGetWorkspaces>(url);
  return data;
}

export async function getWorkSpaces() {
  return await getWorkSpacesFetcher(WORKSPACE_URL);
}

async function createWorkspaceFetcher(
  url: string,
  req: RequestCreateWorkspace
) {
  const { data } = await axios.put<ResponseCreateWorkspace>(url, req);
  return data;
}

export async function createWorkspace(req: RequestCreateWorkspace) {
  createWorkspaceFetcher(WORKSPACE_URL, req);
}

async function updateWorkspaceFetcher(
  url: string,
  id: string,
  req: RequestUpdateWorkspace
) {
  const { data } = await axios.post<MayError>(`${url}${id}`, req);
  return data;
}

export function updateWorkspace(id: string, req: RequestUpdateWorkspace) {
  return updateWorkspaceFetcher(WORKSPACE_URL, id, req);
}

async function deleteWorkspaceFetcher(url: string, id: string) {
  const { data } = await axios.delete<MayError>(`${url}${id}`);
  return data;
}

export function deleteWorkspace(id: string) {
  return deleteWorkspaceFetcher(WORKSPACE_URL, id);
}

export function useGetWorkspaces(config?: SWRConfiguration) {
  const { data, error } = useSWR<ResponseGetWorkspaces, ServicesError, string>(
    WORKSPACE_URL,
    getWorkSpacesFetcher,
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
  const { data, error } = useSWR<ResponseGetWorkspaces, ServicesError>(
    [WORKSPACE_URL, req],
    createWorkspaceFetcher,
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
  const { data, error } = useSWR<MayError, ServicesError>(
    [WORKSPACE_URL, id, req],
    updateWorkspaceFetcher,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}

export function useDeleteWorkspace(id: string, config?: SWRConfiguration) {
  const { data, error } = useSWR<MayError, ServicesError>(
    [WORKSPACE_URL, id],
    deleteWorkspaceFetcher,
    config
  );
  return {
    data,
    isLoading: !error && !data,
    isError: error,
  };
}
