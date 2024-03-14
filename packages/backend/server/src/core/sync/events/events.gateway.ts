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
import { DocID } from '../../utils/doc';
import { PermissionService } from '../../workspaces/permission';
import { Permission } from '../../workspaces/types';
import {
  AccessDeniedError,
  DocNotFoundError,
  EventError,
  EventErrorCode,
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
          new Logger('EventsGateway').error(e, e.stack);
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

  checkVersion(client: Socket, version?: string) {
    if (
      // @todo(@darkskygit): remove this flag after 0.12 goes stable
      AFFiNE.featureFlags.syncClientVersionCheck &&
      version !== AFFiNE.version
    ) {
      client.emit('server-version-rejected', {
        currentVersion: version,
        requiredVersion: AFFiNE.version,
        reason: `Client version${
          version ? ` ${version}` : ''
        } is outdated, please update to ${AFFiNE.version}`,
      });
      return {
        error: new EventError(
          EventErrorCode.VERSION_REJECTED,
          `Client version ${version} is outdated, please update to ${AFFiNE.version}`
        ),
      };
    }
    return null;
  }

  @Auth()
  @SubscribeMessage('client-handshake-sync')
  async handleClientHandshakeSync(
    @CurrentUser() user: CurrentUser,
    @MessageBody('workspaceId') workspaceId: string,
    @MessageBody('version') version: string | undefined,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    const versionError = this.checkVersion(client, version);
    if (versionError) {
      return versionError;
    }

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
    @CurrentUser() user: CurrentUser,
    @MessageBody('workspaceId') workspaceId: string,
    @MessageBody('version') version: string | undefined,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    const versionError = this.checkVersion(client, version);
    if (versionError) {
      return versionError;
    }

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
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    const versionError = this.checkVersion(client);
    if (versionError) {
      return versionError;
    }
    // should unreachable
    return {
      error: new AccessDeniedError(workspaceId),
    };
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
    @CurrentUser() user: CurrentUser,
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

  @Auth()
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
