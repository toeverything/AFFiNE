import { contextBridge, ipcRenderer } from 'electron';

(async () => {
  const affineApis = await import('./affine-apis');
  contextBridge.exposeInMainWorld('apis', affineApis.apis);
  contextBridge.exposeInMainWorld('events', affineApis.events);
  contextBridge.exposeInMainWorld('appInfo', affineApis.appInfo);

  // Credit to microsoft/vscode
  function validateIPC(channel: string) {
    if (!channel || !channel.startsWith('affine:')) {
      throw new Error(`Unsupported event IPC channel '${channel}'`);
    }

    return true;
  }

  const globals = {
    ipcRenderer: {
      send(channel: string, ...args: any[]) {
        if (validateIPC(channel)) {
          ipcRenderer.send(channel, ...args);
        }
      },

      invoke(channel: string, ...args: any[]) {
        if (validateIPC(channel)) {
          return ipcRenderer.invoke(channel, ...args);
        }
        return void 0;
      },

      on(
        channel: string,
        listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void
      ) {
        if (validateIPC(channel)) {
          ipcRenderer.on(channel, listener);
        }
        return this;
      },

      once(
        channel: string,
        listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void
      ) {
        if (validateIPC(channel)) {
          ipcRenderer.once(channel, listener);
        }
        return this;
      },

      removeListener(
        channel: string,
        listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void
      ) {
        if (validateIPC(channel)) {
          ipcRenderer.removeListener(channel, listener);
        }
        return this;
      },
    },
  };

  try {
    contextBridge.exposeInMainWorld('affine', globals);
  } catch (error) {
    console.error(error);
  }
})();
