import { ipcRenderer } from 'electron';

import { AFFINE_IPC_API_CHANNEL_NAME } from '../../ipc/constant';
import { helperRpc } from './helper-rpc';
import { handlersMeta } from './ipc-meta.gen';

// Handler for main process APIs using ipcRenderer.invoke
const createMainApiHandler = (channel: string) => {
  return (...args: any[]) => {
    return ipcRenderer.invoke(AFFINE_IPC_API_CHANNEL_NAME, channel, ...args);
  };
};

// Create helper API handler
const createHelperApiHandler = (channel: string) => {
  return async (...args: any[]) => {
    return (
      helperRpc[channel]?.(...args) ??
      Promise.reject(new Error(`Method ${channel} not found`))
    );
  };
};

// --- Construct the API object to be exposed ---
// Process main handlers
const mainApis = Object.fromEntries(
  Object.entries(handlersMeta.main).map(([scope, methodNames]) => [
    scope,
    Object.fromEntries(
      (methodNames as readonly string[]).map(methodName => [
        methodName,
        createMainApiHandler(`${scope}:${methodName}`),
      ])
    ),
  ])
);

// Process helper handlers
const helperApis = Object.fromEntries(
  Object.entries(handlersMeta.helper).map(([scope, methodNames]) => [
    scope,
    Object.fromEntries(
      (methodNames as readonly string[]).map(methodName => [
        methodName,
        createHelperApiHandler(`${scope}:${methodName}`),
      ])
    ),
  ])
);

// Combine all APIs
export const exposedApis = {
  ...mainApis,
  ...helperApis,
};
