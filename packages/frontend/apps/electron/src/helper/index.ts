import { AsyncCall } from 'async-call-rpc';

import type { RendererToHelper } from '../shared/type';
import { events, handlers } from './exposed';
import { logger } from './logger';
import { abortGeneration } from './mirror/mirror';
import { stopAllMirrorWatchers, stopMirrorWatcher } from './mirror/watcher';

function setupRendererConnection(rendererPort: Electron.MessagePortMain) {
  const mirrorLeases = new Set<string>();
  const mirrorWatchers = new Set<string>();
  let connectionClosed = false;
  const flattenedHandlers = Object.entries(handlers).flatMap(
    ([namespace, namespaceHandlers]) => {
      return Object.entries(namespaceHandlers).map(([name, handler]) => {
        const handlerWithLog = async (...args: any[]) => {
          try {
            const start = performance.now();
            if (
              namespace === 'mirror' &&
              name === 'stopWatching' &&
              !mirrorWatchers.has(args[0]?.watcherId)
            ) {
              throw new Error('Mirror watcher is not owned by this renderer');
            }
            const result = await handler(...args);
            if (
              namespace === 'mirror' &&
              name === 'beginGeneration' &&
              result &&
              typeof result === 'object' &&
              'lease' in result &&
              typeof result.lease === 'string'
            ) {
              if (connectionClosed) {
                await abortGeneration({ lease: result.lease });
                throw new Error('Renderer disconnected during mirror setup');
              }
              mirrorLeases.add(result.lease);
            }
            if (
              namespace === 'mirror' &&
              name === 'startWatching' &&
              result &&
              typeof result === 'object' &&
              'watcherId' in result &&
              typeof result.watcherId === 'string'
            ) {
              if (connectionClosed) {
                stopMirrorWatcher({ watcherId: result.watcherId });
                throw new Error('Renderer disconnected during mirror setup');
              }
              mirrorWatchers.add(result.watcherId);
            }
            if (namespace === 'mirror' && name === 'abortGeneration') {
              mirrorLeases.delete(args[0]?.lease);
            }
            if (namespace === 'mirror' && name === 'stopWatching') {
              mirrorWatchers.delete(args[0]?.watcherId);
            }
            if (
              namespace === 'mirror' &&
              name === 'finalizeGeneration' &&
              result &&
              typeof result === 'object' &&
              'conflicts' in result &&
              Array.isArray(result.conflicts) &&
              result.conflicts.length === 0
            ) {
              mirrorLeases.delete(args[0]?.lease);
            }
            logger.debug(
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
            // Propagate errors to the renderer so callers don't receive `undefined`
            // and fail with confusing TypeErrors.
            throw error instanceof Error ? error : new Error(String(error));
          }
        };
        return [`${namespace}:${name}`, handlerWithLog];
      });
    }
  );

  rendererPort.once('close', () => {
    connectionClosed = true;
    for (const watcherId of mirrorWatchers) {
      stopMirrorWatcher({ watcherId });
    }
    mirrorWatchers.clear();
    for (const lease of mirrorLeases) {
      abortGeneration({ lease }).catch(error => {
        logger.error('[mirror] failed to abort disconnected lease', error);
      });
    }
    mirrorLeases.clear();
  });
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
      logger.debug('[helper] renderer connected');
    }
  });
}

process.once('exit', stopAllMirrorWatchers);

main();
