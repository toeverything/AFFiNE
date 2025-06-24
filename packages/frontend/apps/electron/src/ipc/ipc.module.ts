import { AsyncLocalStorage } from 'node:async_hooks';

import {
  type DynamicModule,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  WebContentsView,
} from 'electron';

import {
  AFFINE_IPC_API_CHANNEL_NAME,
  AFFINE_IPC_EVENT_CHANNEL_NAME,
} from './constant';
import { IpcScanner } from './ipc-scanner';

/**
 * Injecting IpcMainInvokeEvent to the handler function
 * e.g.,
 *
 * ```
 * @IpcHandle({ scope: IpcScope.UI })
 * async foo() {
 *   const event = getIpcEvent();
 *   const webContents = event.sender;
 * }
 * ```
 */
const ipcEventStore = new AsyncLocalStorage<
  import('electron').IpcMainInvokeEvent
>();

/**
 * Get the current ipc event. Only works if being called within the main process.
 * The use case is to let the handler get access to the caller's webContents.
 */
export const getIpcEvent = () => {
  const event = ipcEventStore.getStore();
  if (!event) {
    throw new Error('No ipc event found');
  }
  return event;
};

@Injectable()
class IpcMainInitializerService implements OnModuleInit {
  context = 'IpcMainInitializerService';
  constructor(
    private readonly ipcScanner: IpcScanner,
    private readonly logger: Logger
  ) {}

  onModuleInit() {
    this.registerHandlers();
    this.registerEventEmitters();
  }

  private registerHandlers() {
    const handlers = this.ipcScanner.scanHandlers();

    const handleIpcMessage = async (...args: any[]) => {
      this.logger.debug('ipcMain.handle', args[0], this.context);
      // args[0] is the `{namespace:key}`
      if (typeof args[0] !== 'string') {
        this.logger.error('invalid ipc message', args, this.context);
        return;
      }

      const handler = handlers.get(args[0]);
      if (!handler) {
        this.logger.error('handler not found for ', args[0], this.context);
        return;
      }

      const realArgs = args.slice(1);

      // put the event LAST for ease of use
      const result = await handler(...realArgs);
      return result;
    };

    this.logger.debug(`Found ${handlers.size} IPC handlers`, this.context);

    ipcMain.handle(
      AFFINE_IPC_API_CHANNEL_NAME,
      (e: IpcMainInvokeEvent, ...args: any[]) => {
        return new Promise((resolve, reject) => {
          ipcEventStore.run(e, () => {
            handleIpcMessage(...args)
              .then(resolve)
              .catch(reject);
          });
        });
      }
    );

    // for handling ipcRenderer.sendSync
    ipcMain.on(AFFINE_IPC_API_CHANNEL_NAME, (e, ...args: any[]) => {
      ipcEventStore.run(e, () => {
        handleIpcMessage(...args)
          .then(ret => {
            e.returnValue = ret;
          })
          .catch(() => {
            // never throw
          });
      });
    });
  }

  private broadcastToAllWindows(channel: string, ...args: any[]) {
    this.logger.debug('broadcast event', channel, this.context);
    BrowserWindow.getAllWindows().forEach(win => {
      if (win.isDestroyed()) return;

      win.webContents?.send(AFFINE_IPC_EVENT_CHANNEL_NAME, channel, ...args);
      if (win.contentView && win.contentView.children) {
        win.contentView.children.forEach(child => {
          if (
            child instanceof WebContentsView &&
            child.webContents &&
            !child.webContents.isDestroyed()
          ) {
            child.webContents.send(
              AFFINE_IPC_EVENT_CHANNEL_NAME,
              channel,
              ...args
            );
          }
        });
      }
    });
  }

  private registerEventEmitters() {
    const eventSources = this.ipcScanner.scanEventSources();
    const unsubscribers: (() => void)[] = [];

    this.logger.debug(
      `Found ${eventSources.size} IPC event sources`,
      this.context
    );

    for (const [channel, eventSource$] of eventSources.entries()) {
      const unsubscribe = eventSource$.subscribe({
        next: (payload: any) => {
          this.broadcastToAllWindows(channel, payload);
        },
      });
      unsubscribers.push(() => unsubscribe.unsubscribe());
    }

    app.on('before-quit', () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    });
  }
}

export class ElectronIpcModule {
  static forMain(): DynamicModule {
    return {
      module: ElectronIpcModule,
      imports: [DiscoveryModule],
      providers: [IpcScanner, IpcMainInitializerService],
      exports: [IpcScanner],
    };
  }

  static forHelper(): DynamicModule {
    return {
      module: ElectronIpcModule,
      imports: [DiscoveryModule],
      providers: [IpcScanner],
      exports: [IpcScanner],
    };
  }
}
