/**
 * @module preload
 */

import * as remote from '@electron/remote';
import { contextBridge, ipcRenderer } from 'electron';

import { myApiOauth } from '../../auth';
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

contextBridge.exposeInMainWorld('electron', {
  signIn: () => {
    myApiOauth.openAuthWindowAndGetTokens();
  },
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
      const validChannels = ['send-token'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` and is a security risk
        // @ts-ignore
        ipcRenderer.on(channel, (event, ...args) => listener(...args));
      }
    },
    off: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
  },
  reload: () => {
    // const remote.BrowserWindow.getAllWindows();
    const mainWindow = remote.BrowserWindow.getAllWindows().find(
      w => !w.isDestroyed()
    );
    if (!mainWindow) return;
    mainWindow.webContents.reload();
  },
});
