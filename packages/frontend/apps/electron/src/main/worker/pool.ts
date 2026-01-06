import { join } from 'node:path';

import { BrowserWindow, MessageChannelMain, type WebContents } from 'electron';

import { backgroundWorkerViewUrl } from '../constants';
import { ensureHelperProcess } from '../helper-process';
import { logger } from '../logger';
import { buildWebPreferences } from '../web-preferences';

async function getAdditionalArguments() {
  const { getExposedMeta } = await import('../exposed');
  const mainExposedMeta = getExposedMeta();
  const helperProcessManager = await ensureHelperProcess();
  const helperExposedMeta = await helperProcessManager.rpc?.getMeta();
  return [
    `--main-exposed-meta=` + JSON.stringify(mainExposedMeta),
    `--helper-exposed-meta=` + JSON.stringify(helperExposedMeta),
    `--window-name=worker`,
  ];
}

export class WorkerManager {
  static readonly instance = new WorkerManager();

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
    const additionalArguments = await getAdditionalArguments();
    const helperProcessManager = await ensureHelperProcess();
    const exists = this.workers.get(key);
    if (exists) {
      return exists;
    } else {
      const worker = new BrowserWindow({
        width: 1200,
        height: 600,
        webPreferences: buildWebPreferences({
          preload: join(__dirname, './preload.js'),
          additionalArguments: additionalArguments,
        }),
        show: false,
      });

      const record = {
        browserWindow: worker,
        ports: new Set<string>(),
        key,
        loaded: Promise.withResolvers<void>(),
      };

      let disconnectHelperProcess: (() => void) | null = null;
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        this.workers.delete(key);
        disconnectHelperProcess?.();
        disconnectHelperProcess = null;
      };
      const handleWorkerFailure = (reason: string) => {
        logger.error('[worker] renderer process gone', { key, reason });
        record.loaded.reject(new Error(`worker ${key} failed: ${reason}`));
        cleanup();
        try {
          worker.destroy();
        } catch (err) {
          logger.warn('failed to destroy worker window', err);
        }
      };
      worker.on('closed', cleanup);
      worker.webContents.on('render-process-gone', (_event, details) => {
        handleWorkerFailure(details.reason ?? 'unknown');
      });
      worker.webContents.on('unresponsive', () => {
        handleWorkerFailure('unresponsive');
      });
      worker.loadURL(backgroundWorkerViewUrl).catch(e => {
        logger.error('failed to load url', e);
      });
      worker.webContents.addListener('did-finish-load', () => {
        disconnectHelperProcess = helperProcessManager.connectRenderer(
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

    worker.browserWindow.webContents.postMessage('worker-connect', { portId }, [
      portForWorker,
    ]);
    return { portForRenderer, portId };
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
}
