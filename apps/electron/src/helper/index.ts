import type { RendererToHelper } from '@toeverything/infra/preload/electron';
import { AsyncCall } from 'async-call-rpc';

import { events, handlers } from './exposed';
import { logger } from './logger';

function setupRendererConnection(rendererPort: Electron.MessagePortMain) {
  const flattenedHandlers = Object.entries(handlers).flatMap(
    ([namespace, namespaceHandlers]) => {
      return Object.entries(namespaceHandlers).map(([name, handler]) => {
        const handlerWithLog = async (...args: any[]) => {
          try {
            const start = performance.now();
            const result = await handler(...args);
            logger.info(
              '[async-api]',
              `${namespace}.${name}`,
              args.filter(
                arg => typeof arg !== 'function' && typeof arg !== 'object'
              ),
              '-',
              (performance.now() - start).toFixed(2),
              'ms'
            );
            return result;
          } catch (error) {
            logger.error('[async-api]', `${namespace}.${name}`, error);
          }
        };
        return [`${namespace}:${name}`, handlerWithLog];
      });
    }
  );
  const rpc = AsyncCall<RendererToHelper>(
    Object.fromEntries(flattenedHandlers),
    {
      channel: {
        on(listener) {
          const f = (e: Electron.MessageEvent) => {
            listener(e.data);
          };
          rendererPort.on('message', f);
          // MUST start the connection to receive messages
          rendererPort.start();
          return () => {
            rendererPort.off('message', f);
          };
        },
        send(data) {
          rendererPort.postMessage(data);
        },
      },
      log: false,
    }
  );

  for (const [namespace, namespaceEvents] of Object.entries(events)) {
    for (const [key, eventRegister] of Object.entries(namespaceEvents)) {
      const unsub = eventRegister((...args: any[]) => {
        const chan = `${namespace}:${key}`;
        rpc.postEvent(chan, ...args).catch(err => {
          console.error(err);
        });
      });
      process.on('exit', () => {
        unsub();
      });
    }
  }
}

function main() {
  process.parentPort.on('message', e => {
    if (e.data.channel === 'renderer-connect' && e.ports.length === 1) {
      const rendererPort = e.ports[0];
      setupRendererConnection(rendererPort);
      logger.info('[helper] renderer connected');
    }
  });
}

main();
