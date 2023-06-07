// NOTE: we will generate preload types from this file
import { ipcRenderer } from 'electron';

type MainExposedMeta = {
  handlers: [namespace: string, handlerNames: string[]][];
  events: [namespace: string, eventNames: string[]][];
};

const meta: MainExposedMeta = (() => {
  const val = process.argv
    .find(arg => arg.startsWith('--exposed-meta='))
    ?.split('=')[1];

  return val ? JSON.parse(val) : null;
})();

// main handlers that can be invoked from the renderer process
const apis: any = (() => {
  const { handlers: handlersMeta } = meta;

  const all = handlersMeta.map(([namespace, functionNames]) => {
    const namespaceApis = functionNames.map(name => {
      const channel = `${namespace}:${name}`;
      return [
        name,
        (...args: any[]) => {
          return ipcRenderer.invoke(channel, ...args);
        },
      ];
    });
    return [namespace, Object.fromEntries(namespaceApis)];
  });

  return Object.fromEntries(all);
})();

// main events that can be listened to from the renderer process
const events: any = (() => {
  const { events: eventsMeta } = meta;

  // NOTE: ui may try to listen to a lot of the same events, so we increase the limit...
  ipcRenderer.setMaxListeners(100);

  const all = eventsMeta.map(([namespace, eventNames]) => {
    const namespaceEvents = eventNames.map(name => {
      const channel = `${namespace}:${name}`;
      return [
        name,
        (callback: (...args: any[]) => void) => {
          const fn: (
            event: Electron.IpcRendererEvent,
            ...args: any[]
          ) => void = (_, ...args) => {
            callback(...args);
          };
          ipcRenderer.on(channel, fn);
          return () => {
            ipcRenderer.off(channel, fn);
          };
        },
      ];
    });
    return [namespace, Object.fromEntries(namespaceEvents)];
  });
  return Object.fromEntries(all);
})();

const appInfo = {
  electron: true,
};

export { apis, appInfo, events };

// eslint-disable-next-line @typescript-eslint/no-restricted-imports
export type { MainIPCEventMap } from '../../main/src/exposed';
