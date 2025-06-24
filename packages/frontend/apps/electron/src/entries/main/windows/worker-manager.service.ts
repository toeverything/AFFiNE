import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { BrowserWindow, MessageChannelMain, type WebContents } from 'electron';

import {
  AFFINE_WORKER_CONNECT_CHANNEL_NAME,
  getIpcEvent,
  IpcHandle,
  IpcScope,
} from '../../../ipc';
import { backgroundWorkerViewUrl } from '../constants';
import { HelperProcessManager } from '../helper-process';

@Injectable()
export class WorkerManager {
  constructor(
    private readonly helperProcessManager: HelperProcessManager,
    private readonly logger: Logger
  ) {}

  workers = new Map<
    string,
    {
      browserWindow: BrowserWindow;
      ports: Set<string>;
      key: string;
      loaded: PromiseWithResolvers<void>;
    }
  >();

  private async getOrCreateWorker(key: string) {
    const additionalArguments = [`--window-name=worker`];
    await this.helperProcessManager.ensureHelperProcess();
    const exists = this.workers.get(key);
    if (exists) {
      return exists;
    } else {
      const worker = new BrowserWindow({
        width: 1200,
        height: 600,
        webPreferences: {
          preload: join(__dirname, './preload.js'),
          additionalArguments: additionalArguments,
        },
        show: false,
      });

      const record = {
        browserWindow: worker,
        ports: new Set<string>(),
        key,
        loaded: Promise.withResolvers<void>(),
      };

      let disconnectHelperProcess: (() => void) | null = null;
      worker.on('closed', () => {
        this.workers.delete(key);
        disconnectHelperProcess?.();
      });
      worker.loadURL(backgroundWorkerViewUrl).catch(e => {
        this.logger.error('failed to load url', e);
      });
      worker.webContents.addListener('did-finish-load', () => {
        disconnectHelperProcess = this.helperProcessManager.connectRenderer(
          worker.webContents
        );
        record.loaded.resolve();
      });

      this.workers.set(key, record);
      return record;
    }
  }

  async connectWorker(
    key: string,
    portId: string,
    bindWebContent: WebContents
  ) {
    bindWebContent.addListener('destroyed', () => {
      this.disconnectWorker(key, portId);
    });
    const worker = await this.getOrCreateWorker(key);
    worker.ports.add(portId);
    const { port1: portForWorker, port2: portForRenderer } =
      new MessageChannelMain();

    await worker.loaded.promise;

    worker.browserWindow.webContents.postMessage(
      AFFINE_WORKER_CONNECT_CHANNEL_NAME,
      { portId },
      [portForWorker]
    );
    return { portId, portForRenderer };
  }

  disconnectWorker(key: string, portId: string) {
    const worker = this.workers.get(key);
    if (worker) {
      worker.ports.delete(portId);
      if (worker.ports.size === 0) {
        worker.browserWindow.destroy();
        this.workers.delete(key);
      }
    }
  }

  @IpcHandle({ scope: IpcScope.WORKER, name: 'connectWorker' })
  async connectWorkerIpc(key: string, portId: string) {
    const e = getIpcEvent();
    const { portForRenderer } = await this.connectWorker(key, portId, e.sender);
    e.sender.postMessage(AFFINE_WORKER_CONNECT_CHANNEL_NAME, { portId }, [
      portForRenderer,
    ]);
    return { portId };
  }

  @IpcHandle({ scope: IpcScope.WORKER, name: 'disconnectWorker' })
  async disconnectWorkerIpc(key: string, portId: string) {
    this.disconnectWorker(key, portId);
  }
}
