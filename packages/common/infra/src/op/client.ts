import { merge } from 'lodash-es';
import { Observable, type Observer } from 'rxjs';

import {
  AutoMessageHandler,
  type CallMessage,
  type CancelMessage,
  fetchTransferables,
  type MessageCommunicapable,
  type MessageHandlers,
  type SubscribeMessage,
  type UnsubscribeMessage,
} from './message';
import type {
  OpInput,
  OpInputWithSignal,
  OpNames,
  OpOutput,
  OpSchema,
} from './types';

export interface CancelablePromise<T> extends Promise<T> {
  cancel(): void;
}

interface PendingCall extends PromiseWithResolvers<any> {
  id: string;
  timeout: number | NodeJS.Timeout;
}

export interface OpClientOptions {
  timeout?: number;
}

export class OpClient<Ops extends OpSchema> extends AutoMessageHandler {
  private readonly callIds = new Map<OpNames<Ops>, number>();
  private readonly pendingCalls = new Map<string, PendingCall>();
  private readonly obs = new Map<string, Observer<any>>();
  private readonly options: OpClientOptions = {
    timeout: Infinity,
  };

  constructor(port: MessageCommunicapable, options: OpClientOptions = {}) {
    super(port);
    merge(this.options, options);
  }

  protected override get handlers() {
    return {
      return: this.handleReturnMessage,
      next: this.handleSubscriptionNextMessage,
      error: this.handleSubscriptionErrorMessage,
      complete: this.handleSubscriptionCompleteMessage,
    };
  }

  private readonly handleReturnMessage: MessageHandlers['return'] = msg => {
    const pending = this.pendingCalls.get(msg.id);
    if (!pending) {
      return;
    }

    if ('error' in msg) {
      pending.reject(Object.assign(new Error(), msg.error));
    } else {
      pending.resolve(msg.data);
    }
    clearTimeout(pending.timeout);
    this.pendingCalls.delete(msg.id);
  };

  private readonly handleSubscriptionNextMessage: MessageHandlers['next'] =
    msg => {
      const ob = this.obs.get(msg.id);
      if (!ob) {
        return;
      }

      ob.next(msg.data);
    };

  private readonly handleSubscriptionErrorMessage: MessageHandlers['error'] =
    msg => {
      const ob = this.obs.get(msg.id);
      if (!ob) {
        return;
      }

      ob.error(Object.assign(new Error(), msg.error));
    };

  private readonly handleSubscriptionCompleteMessage: MessageHandlers['complete'] =
    msg => {
      const ob = this.obs.get(msg.id);
      if (!ob) {
        return;
      }

      ob.complete();
    };

  protected nextCallId(op: OpNames<Ops>) {
    let id = this.callIds.get(op) ?? 0;
    id++;
    this.callIds.set(op, id);

    return `${op}:${id}`;
  }

  protected currentCallId(op: OpNames<Ops>) {
    return this.callIds.get(op) ?? 0;
  }

  call<Op extends OpNames<Ops>>(
    op: Op,
    ...args: OpInputWithSignal<Ops, Op>
  ): CancelablePromise<OpOutput<Ops, Op>> {
    const promiseWithResolvers = Promise.withResolvers<any>();
    const abortSignal =
      args[args.length - 1] instanceof AbortSignal
        ? (args.pop() as AbortSignal)
        : undefined;
    const payload = args.pop();

    const msg = {
      type: 'call',
      id: this.nextCallId(op),
      name: op as string,
      payload,
    } satisfies CallMessage;

    const promise = promiseWithResolvers.promise as CancelablePromise<any>;

    const raise = (reason: any) => {
      const pending = this.pendingCalls.get(msg.id);
      if (!pending) {
        return;
      }
      this.port.postMessage({
        type: 'cancel',
        id: msg.id,
      } satisfies CancelMessage);
      promiseWithResolvers.reject(reason);
      clearTimeout(pending.timeout);
      this.pendingCalls.delete(msg.id);
    };

    abortSignal?.addEventListener('abort', () => {
      raise(abortSignal.reason);
    });

    promise.cancel = () => {
      raise('canceled');
    };

    const timeout =
      this.options.timeout === Infinity
        ? 0
        : setTimeout(() => {
            raise('timeout');
          }, this.options.timeout);

    const transferables = fetchTransferables(payload);

    this.port.postMessage(msg, { transfer: transferables });
    this.pendingCalls.set(msg.id, {
      ...promiseWithResolvers,
      timeout,
      id: msg.id,
    });

    return promise;
  }

  ob$<Op extends OpNames<Ops>, Out extends OpOutput<Ops, Op>>(
    op: Op,
    ...args: OpInput<Ops, Op>
  ): Observable<Out> {
    const sub$ = new Observable<Out>(ob => {
      const payload = args[0];

      const msg = {
        type: 'subscribe',
        id: this.nextCallId(op),
        name: op as string,
        payload,
      } satisfies SubscribeMessage;

      const transferables = fetchTransferables(payload);
      this.port.postMessage(msg, { transfer: transferables });

      this.obs.set(msg.id, ob);

      return () => {
        ob.complete();
        this.obs.delete(msg.id);
        this.port.postMessage({
          type: 'unsubscribe',
          id: msg.id,
        } satisfies UnsubscribeMessage);
      };
    });

    return sub$;
  }

  destroy() {
    super.close();
    this.pendingCalls.forEach(call => {
      call.reject(new Error('client destroyed'));
    });
    this.pendingCalls.clear();
    this.obs.forEach(ob => {
      ob.complete();
    });
    this.obs.clear();
  }
}
