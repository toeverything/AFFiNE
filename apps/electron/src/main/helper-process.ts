import path from 'node:path';

import { AsyncCall } from 'async-call-rpc';
import {
  app,
  dialog,
  MessageChannelMain,
  shell,
  type UtilityProcess,
  utilityProcess,
  type WebContents,
} from 'electron';

import { restoreOrCreateWindow } from './main-window';
import { MessageEventChannel } from './utils';

const HELPER_PROCESS_PATH = path.join(__dirname, './helper.js');

function pickAndBind<T extends object, U extends keyof T>(
  obj: T,
  keys: U[]
): { [K in U]: T[K] } {
  return keys.reduce((acc, key) => {
    const prop = obj[key];
    acc[key] =
      typeof prop === 'function'
        ? // @ts-expect-error - a hack to bind the function
          prop.bind(obj)
        : prop;
    return acc;
  }, {} as any);
}

class HelperProcessManager {
  ready: Promise<void>;
  #process: UtilityProcess;

  // a rpc server for the main process -> helper process
  rpc: any;

  constructor() {
    const helperProcess = utilityProcess.fork(HELPER_PROCESS_PATH, undefined, {
      cwd: __dirname,
    });
    this.#process = helperProcess;
    this.ready = new Promise(resolve => {
      helperProcess.once('spawn', () => {
        resolve();
      });
    });
  }

  // bridge renderer <-> helper process
  connectRenderer(renderer: WebContents) {
    // connect to the helper process
    const { port1: helperPort, port2: rendererPort } = new MessageChannelMain();
    this.#process.postMessage({ channel: 'renderer-connect' }, [helperPort]);
    renderer.postMessage('helper-connection', null, [rendererPort]);

    return () => {
      helperPort.close();
      rendererPort.close();
    };
  }

  // bridge main <-> helper process
  // also set up the RPC to the helper process
  connectMain() {
    const dialogMethods = pickAndBind(dialog, [
      'showOpenDialog',
      'showSaveDialog',
    ]);
    const shellMethods = pickAndBind(shell, [
      'openExternal',
      'showItemInFolder',
    ]);
    const appMethods = pickAndBind(app, ['getPath']);

    const server = AsyncCall<any>(
      {
        ...dialogMethods,
        ...shellMethods,
        ...appMethods,
      },
      {
        strict: {
          // the channel is shared for other purposes as well so that we do not want to
          // restrict to only JSONRPC messages
          unknownMessage: false,
        },
        channel: new MessageEventChannel(this.#process),
      }
    );
    this.rpc = server;
  }
}

export async function startHelperProcess() {
  const helperProcessManager = new HelperProcessManager();
  await helperProcessManager.ready;
  const window = await restoreOrCreateWindow();
  helperProcessManager.connectMain();
  const unsub = helperProcessManager.connectRenderer(window.webContents);
  app.on('before-quit', unsub);
  return helperProcessManager;
}
