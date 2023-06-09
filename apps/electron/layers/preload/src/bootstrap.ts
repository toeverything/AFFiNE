import { contextBridge, ipcRenderer } from 'electron';

(async () => {
  const affineApis = await import('./affine-apis');
  contextBridge.exposeInMainWorld('apis', affineApis.apis);
  contextBridge.exposeInMainWorld('events', affineApis.events);
  contextBridge.exposeInMainWorld('appInfo', affineApis.appInfo);

  // Credit to microsoft/vscode
  const globals = {
    ipcRenderer: {
      send(channel: string, ...args: any[]) {
        ipcRenderer.send(channel, ...args);
      },

      invoke(channel: string, ...args: any[]) {
        return ipcRenderer.invoke(channel, ...args);
      },

      on(
        channel: string,
        listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void
      ) {
        ipcRenderer.on(channel, listener);
        return this;
      },

      once(
        channel: string,
        listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void
      ) {
        ipcRenderer.once(channel, listener);
        return this;
      },

      removeListener(
        channel: string,
        listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void
      ) {
        ipcRenderer.removeListener(channel, listener);
        return this;
      },
    },
  };

  try {
    contextBridge.exposeInMainWorld('affine', globals);
  } catch (error) {
    console.error('Failed to expose affine APIs to window object!', error);
  }
})();
