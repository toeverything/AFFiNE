/**
 * @module preload
 */

import { contextBridge, ipcRenderer } from 'electron';

import { isMacOS } from '../../utils';

/**
 * The "Main World" is the JavaScript context that your main renderer code runs in.
 * By default, the page you load in your renderer executes code in this world.
 *
 * @see https://www.electronjs.org/docs/api/context-bridge
 */

/**
 * After analyzing the `exposeInMainWorld` calls,
 * `packages/preload/exposedInMainWorld.d.ts` file will be generated.
 * It contains all interfaces.
 * `packages/preload/exposedInMainWorld.d.ts` file is required for TS is `renderer`
 *
 * @see https://github.com/cawa-93/dts-for-context-bridge
 */
contextBridge.exposeInMainWorld('apis', {
  db: {
    // TODO: do we need to store the workspace list locally?
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
});

contextBridge.exposeInMainWorld('appInfo', {
  electron: true,
  isMacOS: isMacOS(),
});
