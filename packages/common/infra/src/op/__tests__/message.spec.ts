import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AutoMessageHandler,
  ignoreUnknownEvent,
  KNOWN_MESSAGE_TYPES,
  type MessageCommunicapable,
  type MessageHandlers,
} from '../message';

class CustomMessageHandler extends AutoMessageHandler {
  public handlers: Partial<MessageHandlers> = {
    call: vi.fn(),
    cancel: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    return: vi.fn(),
    next: vi.fn(),
    error: vi.fn(),
    complete: vi.fn(),
  };
}

declare module 'vitest' {
  interface TestContext {
    sendPort: MessageCommunicapable;
    receivePort: MessageCommunicapable;
    handler: CustomMessageHandler;
  }
}

describe('message', () => {
  beforeEach(ctx => {
    const listeners: ((event: MessageEvent) => void)[] = [];
    ctx.sendPort = {
      postMessage: (msg: any) => {
        listeners.forEach(listener => {
          listener(new MessageEvent('message', { data: msg }));
        });
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    ctx.receivePort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn((_event, handler) => {
        listeners.push(handler);
      }),
      removeEventListener: vi.fn(),
    };
    ctx.handler = new CustomMessageHandler(ctx.receivePort);
  });

  it('should ignore unknown message type', ctx => {
    const handler = vi.fn();
    // @ts-expect-error internal api
    ctx.handler.handleMessage = ignoreUnknownEvent(handler);

    ctx.sendPort.postMessage('connected');
    ctx.sendPort.postMessage({ type: 'call1' });
    ctx.sendPort.postMessage(new Uint8Array());
    ctx.sendPort.postMessage(null);
    ctx.sendPort.postMessage(undefined);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle known message type', async ctx => {
    for (const type of KNOWN_MESSAGE_TYPES) {
      ctx.sendPort.postMessage({ type });
      expect(ctx.handler.handlers[type]).toBeCalled();
    }
  });
});
