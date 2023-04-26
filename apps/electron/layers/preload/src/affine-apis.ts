// NOTE: we will generate preload types from this file

import { ipcRenderer } from 'electron';

import type { MainEventMap, MainIPCHandlerMap } from '../../constraints';

// renderer -> main
function ipcFn<T extends keyof MainIPCHandlerMap>(eventName: T) {
  return (
    ...args: Parameters<MainIPCHandlerMap[T]>
  ): ReturnType<MainIPCHandlerMap[T]> =>
    ipcRenderer.invoke(eventName, ...args) as ReturnType<MainIPCHandlerMap[T]>;
}

// main -> renderer
function ipcCallbackFn<T extends keyof MainEventMap>(eventName: T) {
  return (callback: MainEventMap[T]) => {
    // @ts-expect-error fix me later
    const fn = (_, ...args) => callback(...args);
    ipcRenderer.on(eventName, fn);
    return () => ipcRenderer.off(eventName, fn);
  };
}

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
    onDBUpdate: ipcCallbackFn('main:on-db-file-update'),
  },

  workspace: {
    list: ipcFn('workspace:list'),
    delete: ipcFn('workspace:delete'),
  },

  openLoadDBFileDialog: ipcFn('ui:open-load-db-file-dialog'),
  openSaveDBFileDialog: ipcFn('ui:open-save-db-file-dialog'),

  // ui
  handleThemeChange: ipcFn('ui:theme-change'),
  handleSidebarVisibilityChange: ipcFn('ui:sidebar-visibility-change'),
  handleWorkspaceChange: ipcFn('ui:workspace-change'),
  openDBFolder: ipcFn('ui:open-db-folder'),
  moveDBFile: ipcFn('ui:move-db-file'),

  /**
   * Try sign in using Google and return a request object to exchange the code for a token
   * Not exchange in Node side because it is easier to do it in the renderer with VPN
   */
  getGoogleOauthCode: ipcFn('ui:get-google-oauth-code'),
};

const appInfo = {
  electron: true,
};

export { apis, appInfo };
