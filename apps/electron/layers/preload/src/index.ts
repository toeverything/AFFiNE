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
  workspaceSync: (id: string) => ipcRenderer.invoke('workspaceSync', id),
});

contextBridge.exposeInMainWorld('appInfo', {
  electron: true,
  isMacOS: isMacOS(),
});
