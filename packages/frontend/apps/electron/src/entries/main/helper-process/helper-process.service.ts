import path from 'node:path';

import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import type { _AsyncVersionOf } from 'async-call-rpc';
import { AsyncCall } from 'async-call-rpc';
import type {
  BaseWindow,
  OpenDialogOptions,
  SaveDialogOptions,
  UtilityProcess,
  WebContents,
} from 'electron';
import {
  app,
  dialog,
  MessageChannelMain,
  shell,
  utilityProcess,
} from 'electron';

import {
  AFFINE_HELPER_CONNECT_CHANNEL_NAME,
  AFFINE_RENDERER_CONNECT_CHANNEL_NAME,
} from '../../../ipc';
import type { HelperToMain, MainToHelper } from '../../../shared/type';
import { MessageEventChannel } from '../../../shared/utils';

const isDev = process.env.NODE_ENV === 'development';

const HELPER_PROCESS_PATH = path.join(__dirname, './helper.js');

function pickAndBind<T extends object, U extends keyof T>(
  obj: T,
  keys: U[]
): { [K in U]: T[K] } {
  return keys.reduce((acc, key) => {
    const prop = obj[key];
    acc[key] = typeof prop === 'function' ? prop.bind(obj) : prop;
    return acc;
  }, {} as any);
}

@Injectable()
export class HelperProcessManager
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(HelperProcessManager.name);
  private utilityProcess: UtilityProcess | null = null;
  private _ready = Promise.withResolvers<void>();

  // RPC client for Main -> Helper calls
  rpcToHelper?: _AsyncVersionOf<HelperToMain>;

  get ready() {
    return this._ready.promise;
  }

  async ensureHelperProcess() {
    await this.ready;
    // oxlint-disable-next-line no-non-null-assertion
    return this.utilityProcess!;
  }

  onModuleInit() {
    app.on('ready', () => {
      this.logger.log('Initializing helper process...');

      const helperProcess = utilityProcess.fork(HELPER_PROCESS_PATH, [], {
        execArgv: isDev ? ['--inspect=40895'] : [], // Adjusted port
        serviceName: 'affine-helper-nestjs',
        stdio: 'pipe', // Capture stdio for logging
      });
      this.utilityProcess = helperProcess;

      if (isDev) {
        helperProcess.stdout?.on('data', data => {
          this.logger.log(data.toString().trim());
        });
        helperProcess.stderr?.on('data', data => {
          this.logger.error(data.toString().trim());
        });
      }

      helperProcess.once('spawn', () => {
        this.logger.log(
          `Helper process spawned successfully (PID: ${helperProcess.pid})`
        );
        // The RPC and other connections will be set up after spawn,
        // possibly triggered by other services or parts of the app.
        this._ready.resolve();
      });

      helperProcess.once('exit', code => {
        this.logger.warn(`Helper process exited with code: ${code}`);
        this.utilityProcess = null;
        // Re-reject the promise if it hasn't resolved yet, or handle re-initialization
        this._ready.reject(
          new Error(`Helper process exited with code: ${code}`)
        );
        // Reset ready promise for potential restarts
        this._ready = Promise.withResolvers<void>();
      });
    });
    app.on('will-quit', () => this.onApplicationShutdown());
  }

  onApplicationShutdown(signal?: string) {
    this.logger.log(`Shutting down helper process (signal: ${signal})...`);
    if (this.utilityProcess && this.utilityProcess.kill()) {
      this.logger.log('Helper process killed.');
    } else {
      this.logger.log('Helper process was not running or already killed.');
    }
    this.utilityProcess = null;
  }

  // Bridge renderer <-> helper process
  connectRenderer(renderer: WebContents) {
    if (!this.utilityProcess) {
      this.logger.error('Helper process not started, cannot connect renderer.');
      throw new Error('Helper process not started.');
    }
    const { port1: helperPort, port2: rendererPort } = new MessageChannelMain();
    this.logger.log(
      `Connecting renderer (ID: ${renderer.id}) to helper process.`
    );
    this.utilityProcess.postMessage(
      { channel: AFFINE_RENDERER_CONNECT_CHANNEL_NAME },
      [helperPort]
    );
    renderer.postMessage(AFFINE_HELPER_CONNECT_CHANNEL_NAME, null, [
      rendererPort,
    ]);

    return () => {
      try {
        helperPort.close();
        rendererPort.close();
        this.logger.log(
          `Disconnected renderer (ID: ${renderer.id}) from helper process.`
        );
      } catch (err) {
        this.logger.error('Error closing renderer connection ports:', err);
      }
    };
  }

  // Bridge main <-> helper process
  // also set up the RPC to the helper process
  connectMain(window: BaseWindow) {
    if (!this.utilityProcess) {
      this.logger.error('Helper process not started, cannot connect main.');
      throw new Error('Helper process not started.');
    }
    const dialogMethods = {
      showOpenDialog: async (opts: OpenDialogOptions) => {
        return dialog.showOpenDialog(window, opts);
      },
      showSaveDialog: async (opts: SaveDialogOptions) => {
        return dialog.showSaveDialog(window, opts);
      },
    };
    const shellMethods = pickAndBind(shell, [
      'openExternal',
      'showItemInFolder',
    ]);
    const appMethods = pickAndBind(app, ['getPath']);

    // some electron api is not available in the helper process
    // so we need to proxy them to the helper process
    const mainToHelperServer: MainToHelper = {
      ...dialogMethods,
      ...shellMethods,
      ...appMethods,
    };

    this.rpcToHelper = AsyncCall<HelperToMain>(mainToHelperServer, {
      strict: {
        unknownMessage: false,
      },
      channel: new MessageEventChannel(this.utilityProcess),
      log: false,
    });
    this.logger.log('Main process connected to helper process for RPC.');
  }
}
