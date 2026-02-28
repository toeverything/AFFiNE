// Please add modules to `external` in `rollupOptions` to avoid wrong bundling.
import type { MessagePort } from 'node:worker_threads';

import type { EventBasedChannel } from 'async-call-rpc';
import { AsyncCall } from 'async-call-rpc';
import { ipcRenderer } from 'electron';
import { Subject } from 'rxjs';
import { z } from 'zod';

import {
  AFFINE_API_CHANNEL_NAME,
  AFFINE_EVENT_CHANNEL_NAME,
  type ExposedMeta,
  type HelperToRenderer,
  type RendererToHelper,
} from '../shared/type';

type Schema =
  | 'affine'
  | 'affine-canary'
  | 'affine-beta'
  | 'affine-internal'
  | 'affine-dev';

// todo: remove duplicated codes
const ReleaseTypeSchema = z.enum(['stable', 'beta', 'canary', 'internal']);
const envBuildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();
const buildType = ReleaseTypeSchema.parse(envBuildType);
const isDev = process.env.NODE_ENV === 'development';
let scheme =
  buildType === 'stable' ? 'affine' : (`affine-${envBuildType}` as Schema);
scheme = isDev ? 'affine-dev' : scheme;

export const appInfo = {
  electron: true,
  windowName:
    process.argv.find(arg => arg.startsWith('--window-name='))?.split('=')[1] ??
    'unknown',
  viewId:
    process.argv.find(arg => arg.startsWith('--view-id='))?.split('=')[1] ??
    'unknown',
  scheme,
};

export type AppInfo = typeof appInfo;

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
            return ipcRenderer.invoke(
              AFFINE_API_CHANNEL_NAME,
              channel,
              ...args
            );
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

    // channel -> callback[]
    const listenersMap = new Map<string, ((...args: any[]) => void)[]>();

    ipcRenderer.on(AFFINE_EVENT_CHANNEL_NAME, (_event, channel, ...args) => {
      if (typeof channel !== 'string') {
        console.error('invalid ipc event', channel);
        return;
      }
      const [namespace, name] = channel.split(':');
      if (!namespace || !name) {
        console.error('invalid ipc event', channel);
        return;
      }
      const listeners = listenersMap.get(channel) ?? [];
      listeners.forEach(listener => listener(...args));
    });

    const all = eventsMeta.map(([namespace, eventNames]) => {
      const namespaceEvents = eventNames.map(name => {
        const channel = `${namespace}:${name}`;
        return [
          name,
          (callback: (...args: any[]) => void) => {
            listenersMap.set(channel, [
              ...(listenersMap.get(channel) ?? []),
              callback,
            ]);

            return () => {
              const listeners = listenersMap.get(channel) ?? [];
              const index = listeners.indexOf(callback);
              if (index !== -1) {
                listeners.splice(index, 1);
              }
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

const helperPort = new Promise<MessagePort>(resolve =>
  ipcRenderer.on('helper-connection', e => {
    console.info('[preload] helper-connection', e);
    resolve(e.ports[0]);
  })
);

const createMessagePortChannel = (port: MessagePort): EventBasedChannel => {
  return {
    on(listener) {
      const listen = (e: MessageEvent) => {
        listener(e.data);
      };
      port.addEventListener('message', listen as any);
      port.start();
      return () => {
        port.removeEventListener('message', listen as any);
        try {
          port.close();
        } catch (err) {
          console.error('[helper] close port error', err);
        }
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
    channel: helperPort.then(helperPort =>
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

const mainAPIs = getMainAPIs();
const helperAPIs = getHelperAPIs();

export const apis = {
  ...mainAPIs.apis,
  ...helperAPIs.apis,
};

export const events = {
  ...mainAPIs.events,
  ...helperAPIs.events,
};
