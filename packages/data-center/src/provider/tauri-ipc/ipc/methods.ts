import { invoke } from '@tauri-apps/api';
import {
  GetDocumentParameter,
  GetDocumentResponse,
  YDocumentUpdate,
} from './types/document';
import {
  CreateWorkspace,
  CreateWorkspaceResult,
  GetWorkspace,
  GetWorkspaceResult,
  GetWorkspaces,
  GetWorkspacesResult,
  User,
} from './types/workspace';
import { GetBlob, PutBlob } from './types/blob';
import { CreateUser } from './types/user';

export const updateYDocument = async (parameters: YDocumentUpdate) =>
  await invoke<boolean>('update_y_document', {
    parameters,
  });

export const getYDocument = async (parameters: GetDocumentParameter) =>
  await invoke<GetDocumentResponse>('get_doc', {
    parameters,
  });

export const createWorkspace = async (parameters: CreateWorkspace) =>
  await invoke<CreateWorkspaceResult>('create_workspace', {
    parameters,
  });

export const getWorkspaces = async (parameters: GetWorkspaces) =>
  await invoke<GetWorkspacesResult>('get_workspaces', {
    parameters,
  });

export const getWorkspace = async (parameters: GetWorkspace) =>
  await invoke<GetWorkspaceResult>('get_workspace', {
    parameters,
  });

export const putBlob = async (parameters: PutBlob) =>
  await invoke<string>('put_blob', {
    parameters,
  });

export const getBlob = async (parameters: GetBlob) =>
  await invoke<number[]>('get_blob', {
    parameters,
  });

export const createUser = async (parameters: CreateUser) =>
  await invoke<User>('create_user', {
    parameters,
  });
