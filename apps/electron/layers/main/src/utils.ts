import type { MessagePort, Worker } from 'node:worker_threads';

import type { EventBasedChannel } from 'async-call-rpc';

export function getTime() {
  return new Date().getTime();
}

export const isMacOS = () => {
  return process.platform === 'darwin';
};

export const isWindows = () => {
  return process.platform === 'win32';
};

export class ThreadWorkerChannel implements EventBasedChannel {
  constructor(private worker: Worker) {}

  on(listener: (data: unknown) => void) {
    this.worker.addListener('message', listener);
    return () => {
      this.worker.removeListener('message', listener);
    };
  }

  send(data: unknown) {
    this.worker.postMessage(data);
  }
}

export class MessagePortChannel implements EventBasedChannel {
  constructor(private port: MessagePort) {}

  on(listener: (data: unknown) => void) {
    this.port.addListener('message', listener);
    return () => {
      this.port.removeListener('message', listener);
    };
  }

  send(data: unknown) {
    this.port.postMessage(data);
  }
}
