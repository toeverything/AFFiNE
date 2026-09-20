import EventEmitter2 from 'eventemitter2';
import { pick } from 'lodash-es';
import { defer, from, fromEvent, Observable, of, take, takeUntil } from 'rxjs';

import { MANUALLY_STOP } from '../utils';
import {
  AutoMessageHandler,
  type CallMessage,
  fetchTransferables,
  type MessageHandlers,
  type ReturnMessage,
  type SubscribeMessage,
  type SubscriptionCompleteMessage,
  type SubscriptionErrorMessage,
  type SubscriptionNextMessage,
} from './message';
import type { OpInput, OpNames, OpOutput, OpSchema } from './types';

const SERIALIZABLE_ERROR_FIELDS = [
  'name',
  'message',
  'code',
  'type',
  'status',
  'data',
  'stacktrace',
] as const;

type SerializableErrorShape = Partial<
  Record<(typeof SERIALIZABLE_ERROR_FIELDS)[number], unknown>
> & {
  name?: string;
  message?: string;
};

function getFallbackErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint' ||
    typeof error === 'symbol'
  ) {
    return String(error);
  }

  if (error === null || error === undefined) {
    return 'Unknown error';
  }

  try {
    const jsonMessage = JSON.stringify(error);
    if (jsonMessage && jsonMessage !== '{}') {
      return jsonMessage;
    }
  } catch {
    return 'Unknown error';
  }

  return 'Unknown error';
}

function serializeError(error: unknown): Error {
  const valueToPick =
    error && typeof error === 'object'
      ? error
      : ({} as Record<string, unknown>);
  const serialized = pick(
    valueToPick,
    SERIALIZABLE_ERROR_FIELDS
  ) as SerializableErrorShape;

  if (!serialized.message || typeof serialized.message !== 'string') {
    serialized.message = getFallbackErrorMessage(error);
  }

  if (!serialized.name || typeof serialized.name !== 'string') {
    if (error instanceof Error && error.name) {
      serialized.name = error.name;
    } else if (error && typeof error === 'object') {
      const constructorName = error.constructor?.name;
      serialized.name =
        typeof constructorName === 'string' && constructorName.length > 0
          ? constructorName
          : 'Error';
    } else {
      serialized.name = 'Error';
    }
  }

  if (
    !serialized.stacktrace &&
    error instanceof Error &&
    typeof error.stack === 'string'
  ) {
    serialized.stacktrace = error.stack;
  }

  return serialized as Error;
}

interface OpCallContext {
  signal: AbortSignal;
}

export type OpHandler<Ops extends OpSchema, Op extends OpNames<Ops>> = (
  payload: OpInput<Ops, Op>[0],
  ctx: OpCallContext
) =>
  | OpOutput<Ops, Op>
  | Promise<OpOutput<Ops, Op>>
  | Observable<OpOutput<Ops, Op>>;

export class OpConsumer<Ops extends OpSchema> extends AutoMessageHandler {
  private readonly eventBus = new EventEmitter2();

  private readonly registeredOpHandlers = new Map<
    OpNames<Ops>,
    OpHandler<Ops, any>
  >();

  private readonly processing = new Map<string, AbortController>();

  override get handlers() {
    return {
      call: this.handleCallMessage,
      cancel: this.handleCancelMessage,
      subscribe: this.handleSubscribeMessage,
      unsubscribe: this.handleCancelMessage,
    };
  }

  private readonly handleCallMessage: MessageHandlers['call'] = msg => {
    const abortController = new AbortController();
    this.processing.set(msg.id, abortController);

    this.eventBus.emit(`before:${msg.name}`, msg.payload);
    this.ob$(msg, abortController.signal)
      .pipe(take(1))
      .subscribe({
        next: data => {
          this.eventBus.emit(`after:${msg.name}`, msg.payload, data);
          const transferables = fetchTransferables(data);
          this.port.postMessage(
            {
              type: 'return',
              id: msg.id,
              data,
            } satisfies ReturnMessage,
            { transfer: transferables }
          );
        },
        error: error => {
          this.port.postMessage({
            type: 'return',
            id: msg.id,
            error: serializeError(error),
          } satisfies ReturnMessage);
        },
        complete: () => {
          this.processing.delete(msg.id);
        },
      });
  };

  private readonly handleSubscribeMessage: MessageHandlers['subscribe'] =
    msg => {
      const abortController = new AbortController();
      this.processing.set(msg.id, abortController);

      this.ob$(msg, abortController.signal).subscribe({
        next: data => {
          const transferables = fetchTransferables(data);
          this.port.postMessage(
            {
              type: 'next',
              id: msg.id,
              data,
            } satisfies SubscriptionNextMessage,
            { transfer: transferables }
          );
        },
        error: error => {
          this.port.postMessage({
            type: 'error',
            id: msg.id,
            error: serializeError(error),
          } satisfies SubscriptionErrorMessage);
        },
        complete: () => {
          this.port.postMessage({
            type: 'complete',
            id: msg.id,
          } satisfies SubscriptionCompleteMessage);
          this.processing.delete(msg.id);
        },
      });
    };

  private readonly handleCancelMessage: MessageHandlers['cancel'] &
    MessageHandlers['unsubscribe'] = msg => {
    const abortController = this.processing.get(msg.id);
    if (!abortController) {
      return;
    }

    abortController.abort(MANUALLY_STOP);
  };

  register<Op extends OpNames<Ops>>(op: Op, handler: OpHandler<Ops, Op>) {
    this.registeredOpHandlers.set(op, handler);
  }

  registerAll(
    handlers: OpNames<Ops> extends string
      ? { [K in OpNames<Ops>]: OpHandler<Ops, K> }
      : never
  ) {
    for (const [op, handler] of Object.entries(handlers)) {
      this.register(op as any, handler as any);
    }
  }

  before<Op extends OpNames<Ops>>(
    op: Op,
    handler: (...input: OpInput<Ops, Op>) => void
  ) {
    this.eventBus.on(`before:${op}`, handler);
  }

  after<Op extends OpNames<Ops>>(
    op: Op,
    handler: (...args: [...OpInput<Ops, Op>, OpOutput<Ops, Op>]) => void
  ) {
    this.eventBus.on(`after:${op}`, handler);
  }

  /**
   * @internal
   */
  ob$(op: CallMessage | SubscribeMessage, signal: AbortSignal) {
    return defer(() => {
      const handler = this.registeredOpHandlers.get(op.name as any);
      if (!handler) {
        throw new Error(
          `Handler for operation [${op.name}] is not registered.`
        );
      }

      const ret$ = handler(op.payload, { signal });

      let ob$: Observable<any>;
      if (ret$ instanceof Promise) {
        ob$ = from(ret$);
      } else if (ret$ instanceof Observable) {
        ob$ = ret$;
      } else {
        ob$ = of(ret$);
      }

      return ob$.pipe(takeUntil(fromEvent(signal, 'abort')));
    });
  }

  destroy() {
    super.close();
    this.registeredOpHandlers.clear();
    this.processing.forEach(controller => {
      controller.abort(MANUALLY_STOP);
    });
    this.processing.clear();
    this.eventBus.removeAllListeners();
  }
}
