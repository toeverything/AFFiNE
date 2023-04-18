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
  workspaceSync: (id: string) => ipcRenderer.invoke('octo:workspace-sync', id),

  // ui
  onThemeChange: (theme: string) =>
    ipcRenderer.invoke('ui:theme-change', theme),

  onSidebarVisibilityChange: (visible: boolean) =>
    ipcRenderer.invoke('ui:sidebar-visibility-change', visible),

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
