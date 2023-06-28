// NOTE: we will generate preload types from this file
import { AsyncCall, type EventBasedChannel } from 'async-call-rpc';
import { ipcRenderer } from 'electron';
import { Subject } from 'rxjs';

type ExposedMeta = {
  handlers: [namespace: string, handlerNames: string[]][];
  events: [namespace: string, eventNames: string[]][];
};

export function getAffineAPIs() {
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

export const appInfo = {
  electron: true,
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
  ipcRenderer.on('helper-connection', async e => {
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
  const meta: ExposedMeta = (() => {
    const val = process.argv
      .find(arg => arg.startsWith('--helper-exposed-meta='))
      ?.split('=')[1];

    return val ? JSON.parse(val) : null;
  })();

  const rendererToHelperServer: PeersAPIs.RendererToHelper = {
    postEvent: (channel, ...args) => {
      events$.next({ channel, args });
    },
  };

  const rpc = AsyncCall<PeersAPIs.HelperToRenderer>(rendererToHelperServer, {
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
    const { handlers: handlersMeta, events: eventsMeta } = meta;

    const helperHandlers = Object.fromEntries(
      handlersMeta.map(([namespace, functionNames]) => {
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
      eventsMeta.map(([namespace, eventNames]) => {
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

  const [apis, events] = setup(meta);

  return { apis, events };
}
