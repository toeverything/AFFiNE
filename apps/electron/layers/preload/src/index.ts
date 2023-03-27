/**
 * @module preload
 */

import { contextBridge, ipcRenderer } from 'electron';

import { sha256sum } from './sha256sum';

// Expose version number to renderer
contextBridge.exposeInMainWorld('yerba', { version: 0.1 });

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

/**
 * Safe expose node.js API
 * @example
 * window.nodeCrypto('data')
 */
contextBridge.exposeInMainWorld('nodeCrypto', { sha256sum });

contextBridge.exposeInMainWorld('apis', {
  workspaceSync: (id: string) => ipcRenderer.invoke('workspaceSync', id),
});

contextBridge.exposeInMainWorld('appInfo', {
  electron: 1,
});
