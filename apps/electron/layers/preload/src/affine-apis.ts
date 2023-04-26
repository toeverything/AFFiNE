// NOTE: we will generate preload types from this file

import { ipcRenderer } from 'electron';

import type { MainEventMap, MainIPCHandlerMap } from '../../constraints';

// main -> renderer
function onMainEvent<T extends keyof MainEventMap>(
  eventName: T,
  callback: MainEventMap[T]
): () => void {
  // @ts-expect-error fix me later
  const fn = (_, ...args) => callback(...args);
  ipcRenderer.on(eventName, fn);
  return () => ipcRenderer.off(eventName, fn);
}

function ipcFn<T extends keyof MainIPCHandlerMap>(eventName: T) {
  return async (...args: Parameters<MainIPCHandlerMap[T]>) =>
    await ipcRenderer.invoke(eventName, ...args);
}

function ipcCallbackFn<T extends keyof MainEventMap>(eventName: T) {
  return async (
    callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void,
    ...args: Parameters<MainEventMap[T]>
  ) => {
    ipcRenderer.on(eventName, callback);
    return () => ipcRenderer.off(eventName, callback);
  };
}

export const listeners = {
  'main:on-db-file-update': (callback: (workspaceId: string) => void) => {},
};

const apis = {
  db: {
    // workspace providers
    getDoc: ipcFn('db:get-doc'),
    applyDocUpdate: ipcFn('db:apply-doc-update'),
    addBlob: ipcFn('db:add-blob'),
    getBlob: ipcFn('db:get-blob'),
    deleteBlob: ipcFn('db:delete-blob'),
    getPersistedBlobs: ipcFn('db:get-persisted-blobs'),

    // listeners
    onDBUpdate: (callback: (workspaceId: string) => void) => {
      return onMainEvent('main:on-db-file-update', callback);
    },
  },

  workspace: {
    list: ipcFn('workspace:list'),
    delete: ipcFn('workspace:delete'),
  },

  openLoadDBFileDialog: ipcFn('ui:open-load-db-file-dialog'),
  openSaveDBFileDialog: ipcFn('ui:open-save-db-file-dialog'),

  // ui
  onThemeChange: ipcFn('ui:theme-change'),
  onSidebarVisibilityChange: ipcFn('ui:sidebar-visibility-change'),
  onWorkspaceChange: ipcFn('ui:workspace-change'),

  openDBFolder: ipcFn('ui:open-db-folder'),

  /**
   * Try sign in using Google and return a request object to exchange the code for a token
   * Not exchange in Node side because it is easier to do it in the renderer with VPN
   */
  getGoogleOauthCode: ipcFn('ui:get-google-oauth-code'),

  /**
   * Secret backdoor to update environment variables in main process
   */
  updateEnv: (env: string, value: string) => {
    ipcRenderer.invoke('main:env-update', env, value);
  },
};

const appInfo = {
  electron: true,
};

export { apis, appInfo };
