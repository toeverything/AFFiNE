// NOTE: we will generate preload types from this file

import { ipcRenderer } from 'electron';

import type { MainEventMap } from '../../main-events';

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

const apis = {
  db: {
    // workspace providers
    getDoc: (id: string): Promise<Uint8Array | null> =>
      ipcRenderer.invoke('db:get-doc', id),
    applyDocUpdate: (id: string, update: Uint8Array) =>
      ipcRenderer.invoke('db:apply-doc-update', id, update),
    addBlob: (workspaceId: string, key: string, data: Uint8Array) =>
      ipcRenderer.invoke('db:add-blob', workspaceId, key, data),
    getBlob: (workspaceId: string, key: string): Promise<Uint8Array | null> =>
      ipcRenderer.invoke('db:get-blob', workspaceId, key),
    deleteBlob: (workspaceId: string, key: string) =>
      ipcRenderer.invoke('db:delete-blob', workspaceId, key),
    getPersistedBlobs: (workspaceId: string): Promise<string[]> =>
      ipcRenderer.invoke('db:get-persisted-blobs', workspaceId),

    // listeners
    onDBUpdate: (callback: (workspaceId: string) => void) => {
      return onMainEvent('main:on-db-update', callback);
    },
  },

  workspace: {
    list: (): Promise<string[]> => ipcRenderer.invoke('workspace:list'),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('workspace:delete', id),
    // create will be implicitly called by db functions
  },

  openLoadDBFileDialog: () => ipcRenderer.invoke('ui:open-load-db-file-dialog'),
  openSaveDBFileDialog: () => ipcRenderer.invoke('ui:open-save-db-file-dialog'),

  // ui
  onThemeChange: (theme: string) =>
    ipcRenderer.invoke('ui:theme-change', theme),

  onSidebarVisibilityChange: (visible: boolean) =>
    ipcRenderer.invoke('ui:sidebar-visibility-change', visible),

  onWorkspaceChange: (workspaceId: string) =>
    ipcRenderer.invoke('ui:workspace-change', workspaceId),

  openDBFolder: () => ipcRenderer.invoke('ui:open-db-folder'),

  /**
   * Try sign in using Google and return a request object to exchange the code for a token
   * Not exchange in Node side because it is easier to do it in the renderer with VPN
   */
  getGoogleOauthCode: (): Promise<{ requestInit: RequestInit; url: string }> =>
    ipcRenderer.invoke('ui:get-google-oauth-code'),

  /**
   * Secret backdoor to update environment variables in main process
   */
  updateEnv: (env: string, value: string) => {
    ipcRenderer.invoke('main:env-update', env, value);
  },
  onClientUpdateInstall: () => {
    ipcRenderer.invoke('ui:client-update-install');
  },

  onClientUpdateAvailable: (callback: (version: string) => void) => {
    return onMainEvent('main:client-update-available', callback);
  },
};

const appInfo = {
  electron: true,
};

export { apis, appInfo };
