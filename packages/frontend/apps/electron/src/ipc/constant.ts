export enum IpcScope {
  UI = 'ui',
  MENU = 'menu',
  UPDATER = 'updater',
  POPUP = 'popup',
  FIND_IN_PAGE = 'findInPage',
  RECORDING = 'recording',
  WORKER = 'worker',
  WORKSPACE = 'workspace',
  DIALOG = 'dialog',
  NBSTORE = 'nbstore',
  DB = 'db',
  SHARED_STORAGE = 'sharedStorage',
}

export const AFFINE_IPC_API_CHANNEL_NAME = 'affine-ipc-api';
export const AFFINE_IPC_EVENT_CHANNEL_NAME = 'affine-ipc-event';

export const AFFINE_RENDERER_CONNECT_CHANNEL_NAME = 'renderer-connect';
export const AFFINE_HELPER_CONNECT_CHANNEL_NAME = 'helper-connect';
export const AFFINE_WORKER_CONNECT_CHANNEL_NAME = 'worker-connect';
