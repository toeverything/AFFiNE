// Credit: https://github.com/spaceagetv/electron-playwright-helpers/blob/main/src/ipc_helpers.ts
import type { Page } from '@playwright/test';
import type { ElectronApplication } from 'playwright';

export function ipcRendererInvoke(page: Page, channel: string, ...args: any[]) {
  return page.evaluate(
    ({ channel, args }) => {
      return window.affine.ipcRenderer.invoke(channel, ...args);
    },
    { channel, args }
  );
}

export function ipcRendererSend(page: Page, channel: string, ...args: any[]) {
  return page.evaluate(
    ({ channel, args }) => {
      window.affine.ipcRenderer.send(channel, ...args);
    },
    { channel, args }
  );
}

type IpcMainWithHandlers = Electron.IpcMain & {
  _invokeHandlers: Map<
    string,
    (e: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>
  >;
};

export function shouldCallIpcRendererHandler(
  electronApp: ElectronApplication,
  channel: string
) {
  return electronApp.evaluate(
    async ({ ipcMain }, { channel }) => {
      const ipcMainWH = ipcMain as IpcMainWithHandlers;
      // this is all a bit of a hack, so let's test as we go
      if (!ipcMainWH._invokeHandlers) {
        throw new Error(`Cannot access ipcMain._invokeHandlers`);
      }
      const handler = ipcMainWH._invokeHandlers.get(channel);
      if (!handler) {
        throw new Error(`No ipcMain handler registered for '${channel}'`);
      }
      return new Promise<void>(resolve => {
        ipcMainWH._invokeHandlers.set(channel, async (e, ...args) => {
          ipcMainWH._invokeHandlers.set(channel, handler);
          resolve();
          return handler(e, ...args);
        });
      });
    },
    { channel }
  );
}
