import type { EventBasedChannel } from 'async-call-rpc';
import { AsyncCall } from 'async-call-rpc';

import { dbEvents, dbHandlers } from './db';
import { dialogHandlers } from './dialog';
import { workspaceEvents, workspaceHandlers } from './workspace';

const handlers = {
  db: dbHandlers,
  workspace: workspaceHandlers,
  dialog: dialogHandlers,
};

const events = {
  db: dbEvents,
  workspace: workspaceEvents,
};

const getExposedMeta = () => {
  const handlersMeta = Object.entries(handlers).map(
    ([namespace, namespaceHandlers]) => {
      return [
        namespace,
        Object.keys(namespaceHandlers).map(handlerName => handlerName),
      ];
    }
  );

  const eventsMeta = Object.entries(events).map(
    ([namespace, namespaceHandlers]) => {
      return [
        namespace,
        Object.keys(namespaceHandlers).map(handlerName => handlerName),
      ];
    }
  );

  return {
    handlers: handlersMeta,
    events: eventsMeta,
  };
};

const createMessagePortMainChannel = (
  connection: Electron.MessagePortMain
): EventBasedChannel => {
  return {
    on(listener) {
      const f = (e: Electron.MessageEvent) => {
        listener(e.data);
      };
      connection.on('message', f);
      // MUST start the connection to receive messages
      connection.start();
      return () => {
        connection.off('message', f);
      };
    },
    send(data) {
      connection.postMessage(data);
    },
  };
};

interface RendererAPIs {
  exposeMeta: (meta: ReturnType<typeof getExposedMeta>) => void;
  postEvent: (channel: string, ...args: any[]) => void;
}

function setupRendererConnection(rendererPort: Electron.MessagePortMain) {
  const flattenedHandlers = Object.entries(handlers).flatMap(
    ([namespace, namespaceHandlers]) => {
      return Object.entries(namespaceHandlers).map(([name, handler]) => {
        return [`${namespace}:${name}`, handler];
      });
    }
  );
  const rpc = AsyncCall<RendererAPIs>(Object.fromEntries(flattenedHandlers), {
    channel: createMessagePortMainChannel(rendererPort),
  });
  rpc.exposeMeta(getExposedMeta());

  for (const [namespace, namespaceEvents] of Object.entries(events)) {
    for (const [key, eventRegister] of Object.entries(namespaceEvents)) {
      const subscription = eventRegister((...args: any[]) => {
        const chan = `${namespace}:${key}`;
        rpc.postEvent(chan, ...args);
      });
      process.on('exit', () => {
        subscription();
      });
    }
  }
}

function main() {
  process.parentPort.on('message', e => {
    if (e.data.channel === 'renderer-connect' && e.ports.length === 1) {
      const rendererPort = e.ports[0];
      setupRendererConnection(rendererPort);
    }
  });
}

main();
