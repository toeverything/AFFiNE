import type { MessagePort } from 'node:worker_threads';

import { AsyncCall, type EventBasedChannel } from 'async-call-rpc';
import { ipcRenderer } from 'electron';
import { Subject } from 'rxjs';

import { AFFINE_HELPER_CONNECT_CHANNEL_NAME } from '../../ipc/constant';
import type { HelperToRenderer, RendererToHelper } from '../helper/types';

// Create a channel for MessagePort communication

const createMessagePortChannel = (port: MessagePort): EventBasedChannel => {
  return {
    on(listener) {
      const listen = (e: MessageEvent) => {
        listener(e.data);
      };
      port.addEventListener('message', listen as any);
      port.start();
      return () => {
        port.removeEventListener('message', listen as any);
        try {
          port.close();
        } catch (err) {
          console.error('[helper] close port error', err);
        }
      };
    },
    send(data) {
      port.postMessage(data);
    },
  };
};

export const helperEvents$ = new Subject<{ channel: string; args: any[] }>();
const rendererToHelperServer: RendererToHelper = {
  postEvent: (channel, ...args) => {
    helperEvents$.next({ channel, args });
  },
};

const helperPortPromise = Promise.withResolvers<MessagePort>();

let connected = false;

// Setup for helper process APIs using MessagePort and AsyncCall RPC
ipcRenderer.on(AFFINE_HELPER_CONNECT_CHANNEL_NAME, event => {
  if (connected) {
    return;
  }
  console.info('[preload] helper-connection', event);
  connected = true;
  helperPortPromise.resolve(event.ports[0]);
});

// Helper process RPC setup
export const helperRpc = AsyncCall<HelperToRenderer>(rendererToHelperServer, {
  channel: helperPortPromise.promise.then(port =>
    createMessagePortChannel(port)
  ),
  log: false,
});
