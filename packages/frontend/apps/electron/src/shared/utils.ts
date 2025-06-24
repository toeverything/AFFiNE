import type { EventBasedChannel } from 'async-call-rpc';

interface MessagePortLike {
  postMessage: (data: unknown) => void;
  addListener: (event: 'message', listener: (...args: any[]) => void) => void;
  removeListener: (
    event: 'message',
    listener: (...args: any[]) => void
  ) => void;
}

export class MessageEventChannel implements EventBasedChannel {
  constructor(private readonly worker: MessagePortLike) {}

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

// credit: https://github.com/facebook/fbjs/blob/main/packages/fbjs/src/core/shallowEqual.js
export function shallowEqual<T>(objA: T, objB: T) {
  if (Object.is(objA, objB)) {
    return true;
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  // Test for A's keys different from B.
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, key) ||
      !Object.is(objA[key as keyof T], objB[key as keyof T])
    ) {
      return false;
    }
  }

  return true;
}
