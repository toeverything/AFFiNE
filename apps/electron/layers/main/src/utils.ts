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

interface MessagePortLike {
  postMessage: (data: unknown) => void;
  addListener: (event: 'message', listener: (...args: any[]) => void) => void;
  removeListener: (
    event: 'message',
    listener: (...args: any[]) => void
  ) => void;
}

export class MessageEventChannel implements EventBasedChannel {
  constructor(private worker: MessagePortLike) {}

  on(listener: (data: unknown) => void) {
    const f = (data: unknown) => {
      listener(data);
    };
    this.worker.addListener('message', f);
    return () => {
      this.worker.removeListener('message', f);
    };
  }

  send(data: unknown) {
    this.worker.postMessage(data);
  }
}
