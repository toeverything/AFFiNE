const PRODUCER_MESSAGE_TYPES = [
  'call',
  'cancel',
  'subscribe',
  'unsubscribe',
] as const;
const CONSUMER_MESSAGE_TYPES = ['return', 'next', 'error', 'complete'] as const;
export const KNOWN_MESSAGE_TYPES = new Set([
  ...PRODUCER_MESSAGE_TYPES,
  ...CONSUMER_MESSAGE_TYPES,
]);

type MessageType =
  | (typeof PRODUCER_MESSAGE_TYPES)[number]
  | (typeof CONSUMER_MESSAGE_TYPES)[number];

export interface Message {
  type: MessageType;
}

// in
export interface CallMessage extends Message {
  type: 'call';
  id: string;
  name: string;
  payload: any;
}

export interface CancelMessage extends Message {
  type: 'cancel';
  id: string;
}

export interface SubscribeMessage extends Message {
  type: 'subscribe';
  id: string;
  name: string;
  payload: any;
}

export interface UnsubscribeMessage extends Message {
  type: 'unsubscribe';
  id: string;
}

// out
export type ReturnMessage = {
  type: 'return';
  id: string;
} & (
  | {
      data: any;
    }
  | {
      error: Error;
    }
);

export interface SubscriptionNextMessage extends Message {
  type: 'next';
  id: string;
  data: any;
}

export interface SubscriptionErrorMessage extends Message {
  type: 'error';
  id: string;
  error: Error;
}

export type SubscriptionCompleteMessage = {
  type: 'complete';
  id: string;
};

export type Messages =
  | CallMessage
  | CancelMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | ReturnMessage
  | SubscriptionNextMessage
  | SubscriptionErrorMessage
  | SubscriptionCompleteMessage;

export type MessageHandlers = {
  [Type in Messages['type']]: (
    message: Extract<Messages, { type: Type }>
  ) => void;
};

export type MessageCommunicapable = Pick<
  MessagePort,
  'postMessage' | 'addEventListener' | 'removeEventListener'
> & {
  start?(): void;
  close?(): void;
  terminate?(): void; // For Worker
};

export function ignoreUnknownEvent(handler: (data: Messages) => void) {
  return (event: MessageEvent<Message>) => {
    const data = event.data;

    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.type !== 'string' ||
      !KNOWN_MESSAGE_TYPES.has(data.type)
    ) {
      return;
    }

    handler(data as any);
  };
}

const TRANSFERABLES_CACHE = new Map<any, Transferable[]>();
export function transfer<T>(data: T, transferables: Transferable[]): T {
  TRANSFERABLES_CACHE.set(data, transferables);
  return data;
}

export function fetchTransferables(data: any): Transferable[] | undefined {
  const transferables = TRANSFERABLES_CACHE.get(data);
  if (transferables) {
    TRANSFERABLES_CACHE.delete(data);
  }

  return transferables;
}

export abstract class AutoMessageHandler {
  private listening = false;
  protected abstract handlers: Partial<MessageHandlers>;

  constructor(protected readonly port: MessageCommunicapable) {
    this.listen();
  }

  protected handleMessage = ignoreUnknownEvent((msg: Messages) => {
    const handler = this.handlers[msg.type];
    if (!handler) {
      return;
    }

    handler(msg as any);
  });

  protected listen() {
    if (this.listening) {
      return;
    }

    this.port.addEventListener('message', this.handleMessage);
    this.port.addEventListener('messageerror', console.error);
    this.port.start?.();
    this.listening = true;
  }

  close() {
    this.port.close?.();
    this.port.terminate?.(); // For Worker
    this.port.removeEventListener('message', this.handleMessage);
    this.port.removeEventListener('messageerror', console.error);
    this.listening = false;
  }
}
