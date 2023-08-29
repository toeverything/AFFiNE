// Please add modules to `external` in `rollupOptions` to avoid wrong bundling.
import { AsyncCall, type EventBasedChannel } from 'async-call-rpc';
import type { app, dialog, shell } from 'electron';
import { ipcRenderer } from 'electron';
import { Subject } from 'rxjs';
import { z } from 'zod';

export interface ExposedMeta {
  handlers: [string, string[]][];
  events: [string, string[]][];
}

// render <-> helper
export interface RendererToHelper {
  postEvent: (channel: string, ...args: any[]) => void;
}

export interface HelperToRenderer {
  [key: string]: (...args: any[]) => Promise<any>;
}

// helper <-> main
export interface HelperToMain {
  getMeta: () => ExposedMeta;
}

export type MainToHelper = Pick<
  typeof dialog & typeof shell & typeof app,
  | 'showOpenDialog'
  | 'showSaveDialog'
  | 'openExternal'
  | 'showItemInFolder'
  | 'getPath'
>;

export function getElectronAPIs() {
  const mainAPIs = getMainAPIs();
  const helperAPIs = getHelperAPIs();

  return {
    apis: {
      ...mainAPIs.apis,
      ...helperAPIs.apis,
    },
    events: {
      ...mainAPIs.events,
      ...helperAPIs.events,
    },
  };
}

// todo: remove duplicated codes
const ReleaseTypeSchema = z.enum(['stable', 'beta', 'canary', 'internal']);
const envBuildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();
const buildType = ReleaseTypeSchema.parse(envBuildType);
const isDev = process.env.NODE_ENV === 'development';
let schema = buildType === 'stable' ? 'affine' : `affine-${envBuildType}`;
schema = isDev ? 'affine-dev' : schema;

export const appInfo = {
  electron: true,
  schema,
};

function getMainAPIs() {
  const meta: ExposedMeta = (() => {
    const val = process.argv
      .find(arg => arg.startsWith('--main-exposed-meta='))
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

  return { apis, events };
}

const helperPort$ = new Promise<MessagePort>(resolve =>
  ipcRenderer.on('helper-connection', e => {
    console.info('[preload] helper-connection', e);
    resolve(e.ports[0]);
  })
);

const createMessagePortChannel = (port: MessagePort): EventBasedChannel => {
  return {
    on(listener) {
      port.onmessage = e => {
        listener(e.data);
      };
      port.start();
      return () => {
        port.onmessage = null;
        port.close();
      };
    },
    send(data) {
      port.postMessage(data);
    },
  };
};

function getHelperAPIs() {
  const events$ = new Subject<{ channel: string; args: any[] }>();
  const meta: ExposedMeta | null = (() => {
    const val = process.argv
      .find(arg => arg.startsWith('--helper-exposed-meta='))
      ?.split('=')[1];

    return val ? JSON.parse(val) : null;
  })();

  const rendererToHelperServer: RendererToHelper = {
    postEvent: (channel, ...args) => {
      events$.next({ channel, args });
    },
  };

  const rpc = AsyncCall<HelperToRenderer>(rendererToHelperServer, {
    channel: helperPort$.then(helperPort =>
      createMessagePortChannel(helperPort)
    ),
    log: false,
  });

  const toHelperHandler = (namespace: string, name: string) => {
    return rpc[`${namespace}:${name}`];
  };

  const toHelperEventSubscriber = (namespace: string, name: string) => {
    return (callback: (...args: any[]) => void) => {
      const subscription = events$.subscribe(({ channel, args }) => {
        if (channel === `${namespace}:${name}`) {
          callback(...args);
        }
      });
      return () => {
        subscription.unsubscribe();
      };
    };
  };

  const setup = (meta: ExposedMeta) => {
    const { handlers, events } = meta;

    const helperHandlers = Object.fromEntries(
      handlers.map(([namespace, functionNames]) => {
        return [
          namespace,
          Object.fromEntries(
            functionNames.map(name => {
              return [name, toHelperHandler(namespace, name)];
            })
          ),
        ];
      })
    );

    const helperEvents = Object.fromEntries(
      events.map(([namespace, eventNames]) => {
        return [
          namespace,
          Object.fromEntries(
            eventNames.map(name => {
              return [name, toHelperEventSubscriber(namespace, name)];
            })
          ),
        ];
      })
    );
    return [helperHandlers, helperEvents];
  };

  if (meta) {
    const [apis, events] = setup(meta);
    return { apis, events };
  } else {
    return { apis: {}, events: {} };
  }
}
