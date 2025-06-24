import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { AsyncCall } from 'async-call-rpc';
import type { MessagePortMain } from 'electron';

import { AFFINE_RENDERER_CONNECT_CHANNEL_NAME, IpcScanner } from '../../ipc';
import type { RendererToHelper } from './types';

/**
 * Service that handles the initial bootstrap of the helper process
 * and sets up the connection to the renderer process
 */
@Injectable()
export class HelperBootstrapService implements OnModuleInit {
  private readonly context = 'HelperBootstrap';

  constructor(
    private readonly logger: Logger,
    private readonly ipcScanner: IpcScanner
  ) {}

  /**
   * Initialize the helper process, setting up message listeners for renderer connection
   */
  onModuleInit(): void {
    this.logger.log(`Helper bootstrap started`, this.context);
    // Check if we're in a worker environment with a parent port
    if (!process.parentPort) {
      this.logger.error(
        'Helper process was not started in a worker environment'
      );
      return;
    }

    // Listen for 'renderer-connect' messages from the main process
    process.parentPort.on('message', e => {
      if (
        e.data.channel === AFFINE_RENDERER_CONNECT_CHANNEL_NAME &&
        e.ports.length === 1
      ) {
        this.connectToRenderer(e.ports[0]);
        this.logger.debug('Renderer connected', this.context);
      }
    });

    this.logger.log(
      'Helper bootstrap complete, waiting for renderer connection',
      this.context
    );
  }

  connectToRenderer(rendererPort: MessagePortMain) {
    const handlers = this.ipcScanner.scanHandlers();
    const flattenedHandlers = Array.from(handlers.entries()).map(
      ([channel, handler]) => {
        const handlerWithLog = async (...args: any[]) => {
          try {
            const start = performance.now();
            const result = await handler(...args);
            this.logger.debug(
              `${channel}`,
              'async-api',
              `${args.filter(
                arg => typeof arg !== 'function' && typeof arg !== 'object'
              )} - ${(performance.now() - start).toFixed(2)} ms`
            );
            return result;
          } catch (error) {
            this.logger.error(`${channel}`, String(error), 'async-api');
            throw error; // Re-throw to ensure error is communicated back
          }
        };
        return [channel, handlerWithLog];
      }
    );

    AsyncCall<RendererToHelper>(Object.fromEntries(flattenedHandlers), {
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
    });
  }
}
