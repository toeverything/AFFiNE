import type {
  RealtimeConfigureInput,
  RealtimeEvent,
  RealtimeRequestInputOf,
  RealtimeRequestName,
  RealtimeRequestOutputOf,
  RealtimeStatus,
  RealtimeSubscribeEnvelope,
  RealtimeSubscriptionReady,
  RealtimeTopicEventOf,
  RealtimeTopicInputOf,
  RealtimeTopicName,
} from '@affine/realtime';
import { getRealtimeInputKey } from '@affine/realtime';
import { Observable, Subject } from 'rxjs';

import { type Socket, SocketConnection } from '../impls/cloud/socket';

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

class SocketSubscription {
  private static readonly sockets = new WeakMap<
    Socket,
    Map<string, SocketSubscription>
  >();
  private readonly attempts = new Map<
    AbortSignal,
    { consumers: Set<object>; promise: Promise<void> }
  >();
  private readonly pending = new Set<Promise<void>>();
  private subscriptionId?: string;
  private leaving?: Promise<void>;

  static get(
    socket: Socket,
    envelope: RealtimeSubscribeEnvelope,
    inputKey: string
  ) {
    let subscriptions = this.sockets.get(socket);
    if (!subscriptions) {
      subscriptions = new Map();
      this.sockets.set(socket, subscriptions);
    }
    const key = `${socket.id}:${envelope.topic}:${inputKey}`;
    let subscription = subscriptions.get(key);
    if (!subscription) {
      subscription = new SocketSubscription(socket, key, envelope);
      subscriptions.set(key, subscription);
    }
    return subscription;
  }

  private constructor(
    private readonly socket: Socket,
    private readonly key: string,
    private readonly envelope: RealtimeSubscribeEnvelope
  ) {}

  acquire(consumer: object, generation: AbortSignal) {
    const current = this.attempts.get(generation);
    if (current) {
      current.consumers.add(consumer);
      return current.promise;
    }
    const consumers = new Set([consumer]);
    const promise = (async () => {
      await this.leaving;
      if (
        generation.aborted ||
        consumers.size === 0 ||
        !this.socket.connected
      ) {
        return;
      }
      const ack = await this.socket.emitWithAck(
        'realtime:subscribe',
        this.envelope
      );
      if ('error' in ack) {
        throw rejectAck(ack.error);
      }
      this.subscriptionId = ack.data.subscriptionId;
    })().finally(() => {
      this.pending.delete(promise);
      this.leave();
    });
    this.attempts.set(generation, { consumers, promise });
    this.pending.add(promise);
    return promise;
  }

  release(consumer: object, generation: AbortSignal) {
    const attempt = this.attempts.get(generation);
    if (!attempt) return;
    attempt.consumers.delete(consumer);
    if (attempt.consumers.size === 0) {
      this.attempts.delete(generation);
    }
    this.leave();
  }

  private leave() {
    if (this.attempts.size > 0 || this.leaving) return;
    const subscriptionId = this.subscriptionId;
    this.subscriptionId = undefined;
    if (subscriptionId && this.socket.connected) {
      this.leaving = this.socket
        .emitWithAck('realtime:unsubscribe', {
          ...this.envelope,
          subscriptionId,
        })
        .then(
          () => {},
          () => {}
        )
        .finally(() => {
          this.leaving = undefined;
          this.leave();
        });
    } else if (this.pending.size === 0) {
      SocketSubscription.sockets.get(this.socket)?.delete(this.key);
    }
  }
}

export class RealtimeManager {
  private context?: RealtimeContext;
  private socketConnection?: SocketConnection;
  private socket?: Socket;
  private lastError?: { name: string; message: string };
  private connectionAbort = new AbortController();
  private readonly subscriptions = new Map<
    Subject<RealtimeEvent | RealtimeSubscriptionReady>,
    {
      topic: RealtimeTopicName;
      input: RealtimeTopicInputOf<RealtimeTopicName>;
      inputKey: string;
      registration?: {
        room: SocketSubscription;
        generation: AbortSignal;
      };
      readyGeneration?: AbortSignal;
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
    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT;
    const connectAbort = new AbortController();
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

    try {
      const socket = await Promise.race([
        this.connect(op === 'user.profile.get', connectAbort.signal),
        timeout,
        aborted,
      ]);
      const ack = await Promise.race([
        socket.emitWithAck('realtime:request', {
          op,
          input,
          clientVersion: BUILD_CONFIG.appVersion,
        }),
        timeout,
        aborted,
      ]);

      if ('error' in ack) {
        throw rejectAck(ack.error);
      }

      return ack.data as unknown as RealtimeRequestOutputOf<Op>;
    } finally {
      connectAbort.abort();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortHandler) {
        options?.signal?.removeEventListener('abort', abortHandler);
      }
    }
  }

  subscribe<Topic extends RealtimeTopicName>(
    topic: Topic,
    input: RealtimeTopicInputOf<Topic>
  ): Observable<RealtimeTopicEventOf<Topic> | RealtimeSubscriptionReady> {
    return new Observable(subscriber => {
      const subject$ = new Subject<RealtimeEvent | RealtimeSubscriptionReady>();
      this.subscriptions.set(subject$, {
        topic,
        input,
        inputKey: getRealtimeInputKey(input),
      });
      subscriber.add(
        subject$.subscribe({
          next: event => {
            if ('type' in event) {
              subscriber.next(event);
            } else {
              subscriber.next(event.event as RealtimeTopicEventOf<Topic>);
            }
          },
          error: error => subscriber.error(error),
        })
      );

      const abort = new AbortController();
      this.connect(false, abort.signal).catch(error => {
        const subscription = this.subscriptions.get(subject$);
        if (subscription && !subscription.readyGeneration) {
          this.lastError = normalizeError(error);
          subject$.error(error);
        }
      });

      return () => {
        const registration = this.subscriptions.get(subject$)?.registration;
        this.subscriptions.delete(subject$);
        abort.abort();
        subject$.complete();
        registration?.room.release(subject$, registration.generation);
      };
    });
  }

  getStatus(): RealtimeStatus {
    return {
      endpoint: this.context?.endpoint,
      connected: this.socketConnection?.status === 'connected',
      connecting: this.socketConnection?.status === 'connecting',
      subscriptions: Array.from(this.subscriptions.values()).filter(
        subscription =>
          subscription.readyGeneration === this.connectionAbort.signal
      ).length,
      lastError: this.lastError,
    };
  }

  private async connect(allowUnauthenticated = false, signal?: AbortSignal) {
    while (true) {
      signal?.throwIfAborted();
      if (
        !this.context?.endpoint ||
        (!this.context.authenticated && !allowUnauthenticated)
      ) {
        const error = new Error('Realtime is not authenticated');
        error.name = 'RealtimeUnauthenticated';
        throw error;
      }

      if (!this.socketConnection) {
        this.socketConnection = new SocketConnection(
          this.context.endpoint,
          this.context.isSelfHosted
        );
        this.socketConnection.connect();
      }

      const connection = this.socketConnection;
      const generation = this.connectionAbort.signal;
      try {
        await connection.waitForConnected(
          AbortSignal.any(signal ? [generation, signal] : [generation])
        );
      } catch (error) {
        if (generation.aborted && !signal?.aborted) {
          continue;
        }
        throw error;
      }
      if (connection !== this.socketConnection || generation.aborted) {
        continue;
      }
      const socket = connection.maybeConnection?.socket;
      if (!socket?.connected) {
        continue;
      }
      this.socket = socket;
      socket.off('realtime:event', this.handleEvent);
      socket.on('realtime:event', this.handleEvent);
      socket.off('connect', this.handleReconnect);
      socket.on('connect', this.handleReconnect);
      socket.off('disconnect', this.handleDisconnect);
      socket.on('disconnect', this.handleDisconnect);
      if (this.context.authenticated) {
        this.subscribeAll(socket);
      }
      return socket;
    }
  }

  private readonly handleEvent = (event: RealtimeEvent) => {
    for (const [subject$, subscription] of this.subscriptions) {
      if (
        subscription.readyGeneration === this.connectionAbort.signal &&
        subscription.topic === event.topic &&
        subscription.inputKey === event.inputKey
      ) {
        subject$.next(event);
      }
    }
  };

  private readonly handleReconnect = () => {
    if (!this.context?.authenticated || this.subscriptions.size === 0) {
      return;
    }
    this.connect().catch(error => {
      this.lastError = normalizeError(error);
    });
  };

  private readonly handleDisconnect = () => {
    this.connectionAbort.abort();
    this.connectionAbort = new AbortController();
    for (const [subject$, subscription] of this.subscriptions) {
      const registration = subscription.registration;
      registration?.room.release(subject$, registration.generation);
      subscription.registration = undefined;
    }
  };

  private subscribeAll(socket: Socket) {
    const generation = this.connectionAbort.signal;
    for (const [subject$, subscription] of this.subscriptions) {
      if (subscription.registration?.generation === generation) continue;
      const room = SocketSubscription.get(
        socket,
        {
          topic: subscription.topic,
          input: subscription.input,
          clientVersion: BUILD_CONFIG.appVersion,
        },
        subscription.inputKey
      );
      subscription.registration = { room, generation };
      room
        .acquire(subject$, generation)
        .then(() => {
          if (generation.aborted || !this.subscriptions.has(subject$)) return;
          subscription.readyGeneration = generation;
          subject$.next({ type: 'ready' });
        })
        .catch(error => {
          if (generation.aborted || !this.subscriptions.has(subject$)) return;
          this.lastError = normalizeError(error);
          subject$.error(error);
        });
    }
  }

  private resetConnection() {
    this.handleDisconnect();
    if (this.socketConnection) {
      const socket = this.socket;
      socket?.off('realtime:event', this.handleEvent);
      socket?.off('connect', this.handleReconnect);
      socket?.off('disconnect', this.handleDisconnect);
      this.socketConnection.disconnect(true);
    }
    this.socketConnection = undefined;
    this.socket = undefined;
  }
}
