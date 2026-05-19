import type {
  RealtimeConfigureInput,
  RealtimeEvent,
  RealtimeRequestInputOf,
  RealtimeRequestName,
  RealtimeRequestOutputOf,
  RealtimeStatus,
  RealtimeSubscriptionReady,
  RealtimeTopicEventOf,
  RealtimeTopicInputOf,
  RealtimeTopicName,
} from '@affine/realtime';
import { getRealtimeInputKey } from '@affine/realtime';
import { Observable, Subject } from 'rxjs';

import { SocketConnection } from '../impls/cloud/socket';

const DEFAULT_REQUEST_TIMEOUT = 10_000;

type RealtimeContext = RealtimeConfigureInput;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'RealtimeError', message: String(error) };
}

function rejectAck(error: { name?: string; message?: string; code?: string }) {
  const err = new Error(error.message ?? 'Realtime request failed');
  err.name = error.name ?? 'RealtimeError';
  return err;
}

export class RealtimeManager {
  private context?: RealtimeContext;
  private socketConnection?: SocketConnection;
  private socketKey?: string;
  private lastError?: { name: string; message: string };
  private subscriptionsNeedResubscribe = false;
  private readonly subscriptions = new Map<
    string,
    {
      topic: RealtimeTopicName;
      input: RealtimeTopicInputOf<RealtimeTopicName>;
      inputKey: string;
      subject$: Subject<RealtimeEvent | RealtimeSubscriptionReady>;
      onResubscribed: (subscriptionId: string) => void;
    }
  >();

  setContext(context: RealtimeContext) {
    const nextContext = { ...context };
    const previousContext = this.context;
    const changed =
      !previousContext ||
      previousContext.endpoint !== nextContext.endpoint ||
      previousContext.isSelfHosted !== nextContext.isSelfHosted ||
      previousContext.authenticated !== nextContext.authenticated;

    this.context = nextContext;

    if (changed) {
      this.resetConnection();
      if (
        previousContext &&
        previousContext.authenticated !== nextContext.authenticated
      ) {
        SocketConnection.resetSharedConnection(
          previousContext.endpoint,
          previousContext.isSelfHosted
        );
      }
    }
  }

  async request<Op extends RealtimeRequestName>(
    op: Op,
    input: RealtimeRequestInputOf<Op>,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<RealtimeRequestOutputOf<Op>> {
    const socket = await this.connect(op === 'user.profile.get');
    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;
    const abort = () => {
      const error = new Error(`Realtime request aborted: ${op}`);
      error.name = 'AbortError';
      return error;
    };
    if (options?.signal?.aborted) {
      throw abort();
    }
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`Realtime request timed out: ${op}`);
        error.name = 'RealtimeRequestTimeout';
        reject(error);
      }, timeoutMs);
      timeoutId.unref?.();
    });
    const aborted = new Promise<never>((_resolve, reject) => {
      abortHandler = () => reject(abort());
      options?.signal?.addEventListener('abort', abortHandler, { once: true });
    });

    const ack = await Promise.race([
      socket.emitWithAck('realtime:request', {
        op,
        input,
        clientVersion: BUILD_CONFIG.appVersion,
      }),
      timeout,
      aborted,
    ]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortHandler) {
        options?.signal?.removeEventListener('abort', abortHandler);
      }
    });

    if ('error' in ack) {
      throw rejectAck(ack.error);
    }

    return ack.data as unknown as RealtimeRequestOutputOf<Op>;
  }

  subscribe<Topic extends RealtimeTopicName>(
    topic: Topic,
    input: RealtimeTopicInputOf<Topic>
  ): Observable<RealtimeTopicEventOf<Topic> | RealtimeSubscriptionReady> {
    return new Observable(subscriber => {
      let subscriptionId: string | undefined;
      let subject$: Subject<RealtimeEvent | RealtimeSubscriptionReady>;
      let closed = false;

      const setup = async () => {
        try {
          const socket = await this.connect();
          const ack = await socket.emitWithAck('realtime:subscribe', {
            topic,
            input,
            clientVersion: BUILD_CONFIG.appVersion,
          });
          if ('error' in ack) {
            throw rejectAck(ack.error);
          }
          const data = ack.data;
          subscriptionId = data.subscriptionId;
          if (closed) {
            await socket.emitWithAck('realtime:unsubscribe', {
              subscriptionId: data.subscriptionId,
              topic,
              input,
              clientVersion: BUILD_CONFIG.appVersion,
            });
            return;
          }

          subject$ = new Subject();
          this.subscriptions.set(subscriptionId, {
            topic,
            input,
            inputKey: getRealtimeInputKey(input),
            subject$,
            onResubscribed: nextSubscriptionId => {
              subscriptionId = nextSubscriptionId;
            },
          });
          subscriber.next({
            type: 'ready',
          });
          subject$.subscribe({
            next: event => {
              if ('type' in event) {
                subscriber.next(event);
              } else {
                subscriber.next(event.event as RealtimeTopicEventOf<Topic>);
              }
            },
            error: error => subscriber.error(error),
            complete: () => {},
          });
        } catch (error) {
          this.lastError = normalizeError(error);
          subscriber.error(error);
        }
      };

      setup().catch(error => subscriber.error(error));

      return () => {
        closed = true;
        if (!subscriptionId) {
          return;
        }
        const currentSubscriptionId = subscriptionId;
        this.subscriptions.delete(currentSubscriptionId);
        subject$?.complete();
        if (this.socketConnection?.inner?.socket.connected) {
          this.socketConnection.inner.socket
            .emitWithAck('realtime:unsubscribe', {
              subscriptionId: currentSubscriptionId,
              topic,
              input,
              clientVersion: BUILD_CONFIG.appVersion,
            })
            .catch(() => {});
        }
      };
    });
  }

  getStatus(): RealtimeStatus {
    return {
      endpoint: this.context?.endpoint,
      connected: this.socketConnection?.status === 'connected',
      connecting: this.socketConnection?.status === 'connecting',
      subscriptions: this.subscriptions.size,
      lastError: this.lastError,
    };
  }

  private async connect(allowUnauthenticated = false) {
    if (
      !this.context?.endpoint ||
      (!this.context.authenticated && !allowUnauthenticated)
    ) {
      const error = new Error('Realtime is not authenticated');
      error.name = 'RealtimeUnauthenticated';
      throw error;
    }

    const key = `${this.context.endpoint}:${this.context.isSelfHosted}`;
    if (!this.socketConnection || this.socketKey !== key) {
      this.resetConnection();
      this.socketKey = key;
      this.socketConnection = new SocketConnection(
        this.context.endpoint,
        this.context.isSelfHosted
      );
      this.socketConnection.connect();
    }

    await this.socketConnection.waitForConnected();
    this.socketConnection.inner.socket.off('realtime:event', this.handleEvent);
    this.socketConnection.inner.socket.on('realtime:event', this.handleEvent);
    this.socketConnection.inner.socket.off('connect', this.handleReconnect);
    this.socketConnection.inner.socket.on('connect', this.handleReconnect);
    if (this.subscriptionsNeedResubscribe && this.context.authenticated) {
      await this.resubscribeAll();
    }
    return this.socketConnection.inner.socket;
  }

  private readonly handleEvent = (event: RealtimeEvent) => {
    for (const subscription of this.subscriptions.values()) {
      if (
        subscription.topic === event.topic &&
        subscription.inputKey === event.inputKey
      ) {
        subscription.subject$.next(event);
      }
    }
  };

  private readonly handleReconnect = () => {
    this.resubscribeAll().catch(error => {
      this.lastError = normalizeError(error);
    });
  };

  private async resubscribeAll() {
    const socket = this.socketConnection?.inner.socket;
    if (!socket?.connected || this.subscriptions.size === 0) {
      return;
    }

    const subscriptions = Array.from(this.subscriptions.entries());
    for (const [subscriptionId, subscription] of subscriptions) {
      try {
        const ack = await socket.emitWithAck('realtime:subscribe', {
          topic: subscription.topic,
          input: subscription.input,
          clientVersion: BUILD_CONFIG.appVersion,
        });
        if ('error' in ack) {
          throw rejectAck(ack.error);
        }

        this.subscriptions.delete(subscriptionId);
        this.subscriptions.set(ack.data.subscriptionId, subscription);
        subscription.onResubscribed(ack.data.subscriptionId);
        subscription.subject$.next({
          type: 'ready',
        });
      } catch (error) {
        this.lastError = normalizeError(error);
        this.subscriptions.delete(subscriptionId);
        subscription.subject$.error(error);
      }
    }
    this.subscriptionsNeedResubscribe = false;
  }

  private resetConnection() {
    if (this.socketConnection) {
      this.socketConnection.maybeConnection?.socket.off(
        'realtime:event',
        this.handleEvent
      );
      this.socketConnection.maybeConnection?.socket.off(
        'connect',
        this.handleReconnect
      );
      this.socketConnection.disconnect(true);
    }
    this.socketConnection = undefined;
    this.socketKey = undefined;
    this.subscriptionsNeedResubscribe = this.subscriptions.size > 0;
  }
}
