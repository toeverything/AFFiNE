import { applyDecorators, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage as RawSubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { encodeStateAsUpdate, encodeStateVector } from 'yjs';

import { CallTimer, metrics } from '../../../fundamentals';
import { Auth, CurrentUser } from '../../auth';
import { DocManager } from '../../doc';
import { UserType } from '../../users';
import { DocID } from '../../utils/doc';
import { PermissionService } from '../../workspaces/permission';
import { Permission } from '../../workspaces/types';
import {
  AccessDeniedError,
  DocNotFoundError,
  EventError,
  InternalError,
  NotInWorkspaceError,
} from './error';

export const GatewayErrorWrapper = (): MethodDecorator => {
  // @ts-expect-error allow
  return (
    _target,
    _key,
    desc: TypedPropertyDescriptor<(...args: any[]) => any>
  ) => {
    const originalMethod = desc.value;
    if (!originalMethod) {
      return desc;
    }

    desc.value = function (...args: any[]) {
      let result: any;
      try {
        result = originalMethod.apply(this, args);
      } catch (e) {
        metrics.socketio.counter('unhandled_errors').add(1);
        return {
          error: new InternalError(e as Error),
        };
      }

      if (result instanceof Promise) {
        return result.catch(e => {
          metrics.socketio.counter('unhandled_errors').add(1);
          return {
            error: new InternalError(e),
          };
        });
      } else {
        return result;
      }
    };

    return desc;
  };
};

const SubscribeMessage = (event: string) =>
  applyDecorators(
    GatewayErrorWrapper(),
    CallTimer('socketio', 'event_duration', { event }),
    RawSubscribeMessage(event)
  );

type EventResponse<Data = any> =
  | {
      error: EventError;
    }
  | (Data extends never
      ? {
          data?: never;
        }
      : {
          data: Data;
        });

@WebSocketGateway({
  cors: process.env.NODE_ENV !== 'production',
  transports: ['websocket'],
  // see: https://socket.io/docs/v4/server-options/#maxhttpbuffersize
  maxHttpBufferSize: 1e8, // 100 MB
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  protected logger = new Logger(EventsGateway.name);
  private connectionCount = 0;

  constructor(
    private readonly docManager: DocManager,
    private readonly permissions: PermissionService
  ) {}

  @WebSocketServer()
  server!: Server;

  handleConnection() {
    this.connectionCount++;
    metrics.socketio.gauge('realtime_connections').record(this.connectionCount);
  }

  handleDisconnect() {
    this.connectionCount--;
    metrics.socketio.gauge('realtime_connections').record(this.connectionCount);
  }

  @Auth()
  @SubscribeMessage('client-handshake-sync')
  async handleClientHandshakeSync(
    @CurrentUser() user: UserType,
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    const canWrite = await this.permissions.tryCheckWorkspace(
      workspaceId,
      user.id,
      Permission.Write
    );

    if (canWrite) {
      await client.join(`${workspaceId}:sync`);
      return {
        data: {
          clientId: client.id,
        },
      };
    } else {
      return {
        error: new AccessDeniedError(workspaceId),
      };
    }
  }

  @Auth()
  @SubscribeMessage('client-handshake-awareness')
  async handleClientHandshakeAwareness(
    @CurrentUser() user: UserType,
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    const canWrite = await this.permissions.tryCheckWorkspace(
      workspaceId,
      user.id,
      Permission.Write
    );

    if (canWrite) {
      await client.join(`${workspaceId}:awareness`);
      return {
        data: {
          clientId: client.id,
        },
      };
    } else {
      return {
        error: new AccessDeniedError(workspaceId),
      };
    }
  }

  /**
   * @deprecated use `client-handshake-sync` and `client-handshake-awareness` instead
   */
  @Auth()
  @SubscribeMessage('client-handshake')
  async handleClientHandShake(
    @CurrentUser() user: UserType,
    @MessageBody()
    workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    const canWrite = await this.permissions.tryCheckWorkspace(
      workspaceId,
      user.id,
      Permission.Write
    );

    if (canWrite) {
      await client.join([`${workspaceId}:sync`, `${workspaceId}:awareness`]);
      return {
        data: {
          clientId: client.id,
        },
      };
    } else {
      return {
        error: new AccessDeniedError(workspaceId),
      };
    }
  }

  @SubscribeMessage('client-leave-sync')
  async handleLeaveSync(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    if (client.rooms.has(`${workspaceId}:sync`)) {
      await client.leave(`${workspaceId}:sync`);
      return {};
    } else {
      return {
        error: new NotInWorkspaceError(workspaceId),
      };
    }
  }

  @SubscribeMessage('client-leave-awareness')
  async handleLeaveAwareness(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    if (client.rooms.has(`${workspaceId}:awareness`)) {
      await client.leave(`${workspaceId}:awareness`);
      return {};
    } else {
      return {
        error: new NotInWorkspaceError(workspaceId),
      };
    }
  }

  /**
   * @deprecated use `client-leave-sync` and `client-leave-awareness` instead
   */
  @SubscribeMessage('client-leave')
  async handleClientLeave(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    if (client.rooms.has(`${workspaceId}:sync`)) {
      await client.leave(`${workspaceId}:sync`);
    }
    if (client.rooms.has(`${workspaceId}:awareness`)) {
      await client.leave(`${workspaceId}:awareness`);
    }
    return {};
  }

  /**
   * This is the old version of the `client-update` event without any data protocol.
   * It only exists for backwards compatibility to adapt older clients.
   *
   * @deprecated
   */
  @SubscribeMessage('client-update')
  async handleClientUpdateV1(
    @MessageBody()
    {
      workspaceId,
      guid,
      update,
    }: {
      workspaceId: string;
      guid: string;
      update: string;
    },
    @ConnectedSocket() client: Socket
  ) {
    if (!client.rooms.has(`${workspaceId}:sync`)) {
      this.logger.verbose(
        `Client ${client.id} tried to push update to workspace ${workspaceId} without joining it first`
      );
      return;
    }

    const docId = new DocID(guid, workspaceId);

    client
      .to(`${docId.workspace}:sync`)
      .emit('server-update', { workspaceId, guid, update });

    // broadcast to all clients with newer version that only listen to `server-updates`
    client
      .to(`${docId.workspace}:sync`)
      .emit('server-updates', { workspaceId, guid, updates: [update] });

    const buf = Buffer.from(update, 'base64');
    await this.docManager.push(docId.workspace, docId.guid, buf);
  }

  /**
   * This is the old version of the `doc-load` event without any data protocol.
   * It only exists for backwards compatibility to adapt older clients.
   *
   * @deprecated
   */
  @Auth()
  @SubscribeMessage('doc-load')
  async loadDocV1(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: UserType,
    @MessageBody()
    {
      workspaceId,
      guid,
      stateVector,
    }: {
      workspaceId: string;
      guid: string;
      stateVector?: string;
    }
  ): Promise<{ missing: string; state?: string } | false> {
    if (!client.rooms.has(`${workspaceId}:sync`)) {
      const canRead = await this.permissions.tryCheckWorkspace(
        workspaceId,
        user.id
      );
      if (!canRead) {
        return false;
      }
    }

    const docId = new DocID(guid, workspaceId);
    const doc = await this.docManager.get(docId.workspace, docId.guid);

    if (!doc) {
      return false;
    }

    const missing = Buffer.from(
      encodeStateAsUpdate(
        doc,
        stateVector ? Buffer.from(stateVector, 'base64') : undefined
      )
    ).toString('base64');
    const state = Buffer.from(encodeStateVector(doc)).toString('base64');

    return {
      missing,
      state,
    };
  }

  @SubscribeMessage('client-update-v2')
  async handleClientUpdateV2(
    @MessageBody()
    {
      workspaceId,
      guid,
      updates,
    }: {
      workspaceId: string;
      guid: string;
      updates: string[];
    },
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ accepted: true }>> {
    if (!client.rooms.has(`${workspaceId}:sync`)) {
      return {
        error: new NotInWorkspaceError(workspaceId),
      };
    }

    const docId = new DocID(guid, workspaceId);
    client
      .to(`${docId.workspace}:sync`)
      .emit('server-updates', { workspaceId, guid, updates });

    const buffers = updates.map(update => Buffer.from(update, 'base64'));

    await this.docManager.batchPush(docId.workspace, docId.guid, buffers);
    return {
      data: {
        accepted: true,
      },
    };
  }

  @Auth()
  @SubscribeMessage('doc-load-v2')
  async loadDocV2(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: UserType,
    @MessageBody()
    {
      workspaceId,
      guid,
      stateVector,
    }: {
      workspaceId: string;
      guid: string;
      stateVector?: string;
    }
  ): Promise<EventResponse<{ missing: string; state?: string }>> {
    if (!client.rooms.has(`${workspaceId}:sync`)) {
      const canRead = await this.permissions.tryCheckWorkspace(
        workspaceId,
        user.id
      );
      if (!canRead) {
        return {
          error: new AccessDeniedError(workspaceId),
        };
      }
    }

    const docId = new DocID(guid, workspaceId);
    const doc = await this.docManager.get(docId.workspace, docId.guid);

    if (!doc) {
      return {
        error: new DocNotFoundError(workspaceId, docId.guid),
      };
    }

    const missing = Buffer.from(
      encodeStateAsUpdate(
        doc,
        stateVector ? Buffer.from(stateVector, 'base64') : undefined
      )
    ).toString('base64');
    const state = Buffer.from(encodeStateVector(doc)).toString('base64');

    return {
      data: {
        missing,
        state,
      },
    };
  }

  @SubscribeMessage('awareness-init')
  async handleInitAwareness(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    if (client.rooms.has(`${workspaceId}:awareness`)) {
      client.to(`${workspaceId}:awareness`).emit('new-client-awareness-init');
      return {
        data: {
          clientId: client.id,
        },
      };
    } else {
      return {
        error: new NotInWorkspaceError(workspaceId),
      };
    }
  }

  @SubscribeMessage('awareness-update')
  async handleHelpGatheringAwareness(
    @MessageBody() message: { workspaceId: string; awarenessUpdate: string },
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    if (client.rooms.has(`${message.workspaceId}:awareness`)) {
      client
        .to(`${message.workspaceId}:awareness`)
        .emit('server-awareness-broadcast', message);
      return {};
    } else {
      return {
        error: new NotInWorkspaceError(message.workspaceId),
      };
    }
  }
}
