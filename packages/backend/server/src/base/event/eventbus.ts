import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import EventEmitter2 from 'eventemitter2';
import { once } from 'lodash-es';
import { CLS_ID, ClsService, ClsServiceManager } from 'nestjs-cls';
import type { Server, Socket } from 'socket.io';

import { wrapCallMetric } from '../metrics';
import { genRequestId } from '../utils';
import { type EventName, type EventOptions } from './def';
import { EventHandlerScanner } from './scanner';

interface EventHandlerErrorPayload {
  event: string;
  payload: any;
  error: Error;
}

/**
 * We use socket.io system to auto pub/sub on server to server broadcast events
 */
@WebSocketGateway({
  namespace: 's2s',
})
@Injectable()
export class EventBus
  implements OnGatewayConnection, OnApplicationBootstrap, OnModuleInit
{
  private readonly logger = new Logger(EventBus.name);

  @WebSocketServer()
  private readonly server?: Server;

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly cls: ClsService,
    private readonly scanner: EventHandlerScanner
  ) {}

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
    this.server?.on('broadcast', (event, payload, requestId?: string) => {
      this.cls.run(() => {
        requestId = requestId ?? genRequestId('event');
        this.cls.set(CLS_ID, requestId);
        this.logger.debug(`Server Event: ${event} (Received)`);
        this.emit(event, payload);
      });
    });
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

    // NOTE(@forehalo):
    //   Because all event handlers are wrapped in promisified metrics and cls context, they will always run in standalone tick.
    //   In which way, if handler throws, an unhandled rejection will be triggered and end up with process exiting.
    //   So we catch it here with `emitAsync`
    this.emitter.emitAsync(event, payload).catch(e => {
      this.emitter.emit('error', { event, payload, error: e });
    });

    return true;
  }

  /**
   * Broadcast event to trigger all listeners on all instance in cluster
   */
  broadcast<T extends EventName>(event: T, payload: Events[T]) {
    this.logger.debug(`Server Event: ${event} (Send)`);
    this.server?.serverSideEmit('broadcast', event, payload, this.cls.getId());
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

  private readonly bindEventHandlers = once(() => {
    this.scanner.scan().forEach(({ event, handler, opts }) => {
      this.on(event, handler, opts);
    });
  });
}
