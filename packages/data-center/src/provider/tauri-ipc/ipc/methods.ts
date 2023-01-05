import { invoke } from '@tauri-apps/api';
import { YDocumentUpdate } from '../types/ipc/document';
import { CreateWorkspace } from '../types/ipc/workspace';
import { GetBlob, PutBlob } from '../types/ipc/blob';

export const updateYDocument = async (parameters: YDocumentUpdate) =>
  await invoke<boolean>('update_y_document', {
    parameters,
  });

export const createWorkspace = async (parameters: CreateWorkspace) =>
  await invoke<boolean>('create_workspace', {
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
