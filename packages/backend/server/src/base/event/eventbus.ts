import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import EventEmitter2 from 'eventemitter2';
import type { Redis as IORedis } from 'ioredis';
import { once } from 'lodash-es';
import { CLS_ID, ClsService, ClsServiceManager } from 'nestjs-cls';
import type { Server, Socket } from 'socket.io';

import { wrapCallMetric } from '../metrics';
import { SocketIoRedis } from '../redis';
import { genRequestId } from '../utils';
import {
  BROADCASTABLE_EVENT_NAMES,
  type EventName,
  type EventOptions,
} from './def';
import { EventHandlerScanner } from './scanner';

export const EVENTBUS_REDIS_CHANNEL = 'affine:eventbus:v1';
const EVENT_ORIGIN_CHANNEL_CLS_KEY = 'event:originChannel';
const SEEN_EVENT_ID_CAPACITY = 4096;
const SEEN_EVENT_ID_TTL_MS = 60_000;

interface EventHandlerErrorPayload {
  event: string;
  payload: any;
  error: Error;
}

interface EventBroadcastMeta {
  id?: string;
  originChannel?: string;
}

export interface RedisEventBusEnvelope {
  v: 1;
  id: string;
  originId: string;
  originChannel: string;
  requestId: string | null;
  event: string;
  payload: unknown;
}

export function resolveDeploymentChannel(): string {
  return (
    process.env.AFFINE_DEPLOYMENT_CHANNEL?.trim() ||
    process.env.AFFINE_ENV?.trim() ||
    env.NAMESPACE ||
    'production'
  );
}

export function encodeEventPayload(value: unknown): unknown {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return {
      $b64: Buffer.from(
        value.buffer,
        value.byteOffset,
        value.byteLength
      ).toString('base64'),
    };
  }
  if (Array.isArray(value)) {
    return value.map(encodeEventPayload);
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = encodeEventPayload(entry);
    }
    return out;
  }
  return value;
}

export function decodeEventPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeEventPayload);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      keys.length === 1 &&
      keys[0] === '$b64' &&
      typeof record.$b64 === 'string'
    ) {
      return Buffer.from(record.$b64, 'base64');
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      out[key] = decodeEventPayload(entry);
    }
    return out;
  }
  return value;
}

/**
 * We use socket.io system and the explicit Redis Pub/Sub bridge
 * (`affine:eventbus:v1`) to auto pub/sub on server to server broadcast events
 */
@WebSocketGateway({
  namespace: 's2s',
})
@Injectable()
export class EventBus
  implements
    OnGatewayConnection,
    OnApplicationBootstrap,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(EventBus.name);
  readonly instanceId = randomUUID();
  private readonly seenEventIds = new Map<string, number>();
  private redisPub?: IORedis;
  private redisSub?: IORedis;

  @WebSocketServer()
  private readonly server?: Server;

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly cls: ClsService,
    private readonly scanner: EventHandlerScanner,
    @Optional() private readonly redis?: SocketIoRedis
  ) {}

  get localChannel(): string {
    return resolveDeploymentChannel();
  }

  getCurrentOriginChannel(): string | undefined {
    return this.cls.get<string>(EVENT_ORIGIN_CHANNEL_CLS_KEY);
  }

  handleConnection(client: Socket) {
    // for internal usage only, disallow any connection from client
    this.logger.warn(
      `EventBus get suspicious connection from client ${client.id}, disconnecting...`
    );
    client.disconnect();
  }

  async onModuleInit() {
    this.bindEventHandlers();
    this.emitter.on('error', ({ event, error }: EventHandlerErrorPayload) => {
      this.logger.error(`Error happened when handling event ${event}`, error);
    });
  }

  async onApplicationBootstrap() {
    // Proxy all events received from server(trigger by `server.serverSideEmit`)
    // to internal event system
    this.server?.on(
      'broadcast',
      (event, payload, requestId?: string, meta?: EventBroadcastMeta) => {
        if (meta?.id && !this.markSeen(meta.id)) {
          return;
        }
        this.cls.run(() => {
          const effectiveRequestId = requestId ?? genRequestId('event');
          this.cls.set(CLS_ID, effectiveRequestId);
          if (meta?.originChannel) {
            this.cls.set(EVENT_ORIGIN_CHANNEL_CLS_KEY, meta.originChannel);
          }
          this.logger.debug(`Server Event: ${event} (Received)`);
          this.emit(event, payload);
        });
      }
    );

    if (this.redis) {
      this.redisPub = this.redis.duplicate();
      this.redisSub = this.redis.duplicate();
      this.redisSub.on('message', (channel: string, message: string) => {
        if (channel === EVENTBUS_REDIS_CHANNEL) {
          this.handleRedisMessage(message);
        }
      });
      for (const client of [this.redisPub, this.redisSub]) {
        client.on('error', err =>
          this.logger.warn(`EventBus Redis error: ${err.message}`)
        );
      }
      const subscriber = this.redisSub;
      const subscribe = () => {
        // Keep startup independent of ioredis's unbounded offline command queue.
        void subscriber.subscribe(EVENTBUS_REDIS_CHANNEL).catch(err => {
          this.logger.warn(
            `Failed to subscribe to ${EVENTBUS_REDIS_CHANNEL}: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      };
      // First subscribe initiates lazy connections; ready also restores a failed
      // subscription after reconnect. Redis SUBSCRIBE is idempotent.
      subscriber.on('ready', subscribe);
      subscribe();
    }
  }

  async onModuleDestroy() {
    const clients = [this.redisSub, this.redisPub];
    this.redisSub = undefined;
    this.redisPub = undefined;
    for (const client of clients) {
      if (!client) continue;
      client.removeAllListeners('ready');
      client.removeAllListeners('message');
      client.disconnect();
    }
  }

  handleRedisMessage(raw: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!parsed || typeof parsed !== 'object') {
      return false;
    }
    const envelope = parsed as Partial<RedisEventBusEnvelope>;
    if (
      envelope.v !== 1 ||
      typeof envelope.id !== 'string' ||
      typeof envelope.originId !== 'string' ||
      typeof envelope.event !== 'string' ||
      !BROADCASTABLE_EVENT_NAMES.has(envelope.event)
    ) {
      return false;
    }
    if (envelope.originId === this.instanceId) {
      return false;
    }
    if (!this.markSeen(envelope.id)) {
      return false;
    }
    const payload = decodeEventPayload(envelope.payload);
    this.cls.run(() => {
      const requestId =
        typeof envelope.requestId === 'string' && envelope.requestId.length > 0
          ? envelope.requestId
          : genRequestId('event');
      this.cls.set(CLS_ID, requestId);
      if (typeof envelope.originChannel === 'string') {
        this.cls.set(EVENT_ORIGIN_CHANNEL_CLS_KEY, envelope.originChannel);
      }
      this.logger.debug(`Server Event: ${envelope.event} (Received via Redis)`);
      this.emit(envelope.event as EventName, payload as any);
    });
    return true;
  }

  private markSeen(id: string, now = Date.now()): boolean {
    for (const [seenId, ts] of this.seenEventIds) {
      if (now - ts >= SEEN_EVENT_ID_TTL_MS) {
        this.seenEventIds.delete(seenId);
      } else {
        break;
      }
    }
    if (this.seenEventIds.has(id)) {
      return false;
    }
    while (this.seenEventIds.size >= SEEN_EVENT_ID_CAPACITY) {
      const oldest = this.seenEventIds.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.seenEventIds.delete(oldest);
    }
    this.seenEventIds.set(id, now);
    return true;
  }

  /**
   * Emit event to trigger all listeners on current instance
   */
  async emitAsync<T extends EventName>(event: T, payload: Events[T]) {
    this.logger.debug(`Dispatch event: ${event} (async)`);
    return await this.emitter.emitAsync(event, payload);
  }

  /**
   * Emit event to trigger all listeners on current instance
   */
  emit<T extends EventName>(event: T, payload: Events[T]) {
    this.logger.debug(`Dispatch event: ${event}`);

    this.dispatchAsync(event, payload);

    return true;
  }

  /**
   * Emit event in detached cls context to avoid inheriting current transaction.
   */
  emitDetached<T extends EventName>(event: T, payload: Events[T]) {
    this.logger.debug(`Dispatch event: ${event} (detached)`);

    const requestId = this.cls.getId();
    this.cls.run({ ifNested: 'override' }, () => {
      this.cls.set(CLS_ID, requestId ?? genRequestId('event'));
      this.dispatchAsync(event, payload);
    });

    return true;
  }

  /**
   * Await listeners without inheriting the current transaction.
   */
  async emitDetachedAsync<T extends EventName>(event: T, payload: Events[T]) {
    const requestId = this.cls.getId();
    return await this.cls.run({ ifNested: 'override' }, async () => {
      this.cls.set(CLS_ID, requestId ?? genRequestId('event'));
      return await this.emitAsync(event, payload);
    });
  }

  /**
   * Broadcast event to trigger all listeners on all instance in cluster
   */
  broadcast<T extends EventName>(event: T, payload: Events[T]) {
    this.logger.debug(`Server Event: ${event} (Send)`);
    const id = `eb_${randomUUID()}`;
    const requestId = this.cls.getId() ?? null;
    const originChannel = this.localChannel;
    this.server?.serverSideEmit(
      'broadcast',
      event,
      payload,
      requestId ?? undefined,
      { id, originChannel }
    );
    if (this.redisPub) {
      const envelope: RedisEventBusEnvelope = {
        v: 1,
        id,
        originId: this.instanceId,
        originChannel,
        requestId,
        event,
        payload: encodeEventPayload(payload),
      };
      this.redisPub
        .publish(EVENTBUS_REDIS_CHANNEL, JSON.stringify(envelope))
        .catch(err => {
          this.logger.warn(
            `Failed to publish event ${event} to ${EVENTBUS_REDIS_CHANNEL}: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }
  }

  on<T extends EventName>(
    event: T,
    listener: (payload: Events[T]) => void | Promise<any>,
    opts: EventOptions = {}
  ) {
    const namespace = event.split('.')[0];
    const { name, prepend, suppressError } = opts;
    const handlerName = name ?? listener.name ?? 'anonymous fn';
    let signature = `[${event}] (${handlerName})`;

    const add = prepend ? this.emitter.prependListener : this.emitter.on;

    const handler = wrapCallMetric(
      async (payload: any) => {
        this.logger.verbose(`Handle event ${signature}`);

        const cls = ClsServiceManager.getClsService();
        return await cls.run({ ifNested: 'reuse' }, async () => {
          const requestId = cls.getId();
          if (!requestId) {
            cls.set(CLS_ID, genRequestId('event'));
          }
          try {
            return await listener(payload);
          } catch (e) {
            if (suppressError) {
              this.emitter.emit('error', {
                event,
                payload,
                error: e,
              } as EventHandlerErrorPayload);
            } else {
              throw e;
            }
          }
        });
      },
      'event',
      'event_handler',
      {
        event,
        namespace,
        handler: handlerName,
      }
    );

    add.call(this.emitter, event, handler as any, opts);

    this.logger.log(`Event handler registered ${signature}`);

    return () => {
      this.emitter.off(event, handler as any);
    };
  }

  waitFor<T extends EventName>(name: T, timeout?: number) {
    return this.emitter.waitFor(name, timeout);
  }

  private dispatchAsync<T extends EventName>(event: T, payload: Events[T]) {
    // NOTE:
    //   Because all event handlers are wrapped in promisified metrics and cls context, they will always run in standalone tick.
    //   In which way, if handler throws, an unhandled rejection will be triggered and end up with process exiting.
    //   So we catch it here with `emitAsync`
    this.emitter.emitAsync(event, payload).catch(e => {
      this.emitter.emit('error', { event, payload, error: e });
    });
  }

  private readonly bindEventHandlers = once(() => {
    this.scanner.scan().forEach(({ event, handler, opts }) => {
      this.on(event, handler, opts);
    });
  });
}
