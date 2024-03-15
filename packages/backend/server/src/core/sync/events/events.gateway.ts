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

    desc.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (e) {
        if (e instanceof EventError) {
          return {
            error: e,
          };
        } else {
          metrics.socketio.counter('unhandled_errors').add(1);
          new Logger('EventsGateway').error(e, (e as Error).stack);
          return {
            error: new InternalError(e as Error),
          };
        }
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

function Sync(workspaceId: string): `${string}:sync` {
  return `${workspaceId}:sync`;
}

function Awareness(workspaceId: string): `${string}:awareness` {
  return `${workspaceId}:awareness`;
}

@WebSocketGateway({
  cors: !AFFiNE.node.prod,
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

  assertVersion(client: Socket, version?: string) {
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

      throw new EventError(
        EventErrorCode.VERSION_REJECTED,
        `Client version ${version} is outdated, please update to ${AFFiNE.version}`
      );
    }
  }

  async joinWorkspace(
    client: Socket,
    room: `${string}:${'sync' | 'awareness'}`
  ) {
    await client.join(room);
  }

  async leaveWorkspace(
    client: Socket,
    room: `${string}:${'sync' | 'awareness'}`
  ) {
    await client.leave(room);
  }

  assertInWorkspace(client: Socket, room: `${string}:${'sync' | 'awareness'}`) {
    if (!client.rooms.has(room)) {
      throw new NotInWorkspaceError(room);
    }
  }

  async assertWorkspaceAccessible(
    workspaceId: string,
    userId: string,
    permission: Permission = Permission.Read
  ) {
    if (
      !(await this.permissions.isWorkspaceMember(
        workspaceId,
        userId,
        permission
      ))
    ) {
      throw new AccessDeniedError(workspaceId);
    }
  }

  @Auth()
  @SubscribeMessage('client-handshake-sync')
  async handleClientHandshakeSync(
    @CurrentUser() user: CurrentUser,
    @MessageBody('workspaceId') workspaceId: string,
    @MessageBody('version') version: string | undefined,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    this.assertVersion(client, version);
    await this.assertWorkspaceAccessible(
      workspaceId,
      user.id,
      Permission.Write
    );

    await this.joinWorkspace(client, Sync(workspaceId));
    return {
      data: {
        clientId: client.id,
      },
    };
  }

  @Auth()
  @SubscribeMessage('client-handshake-awareness')
  async handleClientHandshakeAwareness(
    @CurrentUser() user: CurrentUser,
    @MessageBody('workspaceId') workspaceId: string,
    @MessageBody('version') version: string | undefined,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    this.assertVersion(client, version);
    await this.assertWorkspaceAccessible(
      workspaceId,
      user.id,
      Permission.Write
    );

    await this.joinWorkspace(client, Awareness(workspaceId));
    return {
      data: {
        clientId: client.id,
      },
    };
  }

  @SubscribeMessage('client-leave-sync')
  async handleLeaveSync(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    this.assertInWorkspace(client, Sync(workspaceId));
    await this.leaveWorkspace(client, Sync(workspaceId));
    return {};
  }

  @SubscribeMessage('client-leave-awareness')
  async handleLeaveAwareness(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    this.assertInWorkspace(client, Awareness(workspaceId));
    await this.leaveWorkspace(client, Awareness(workspaceId));
    return {};
  }

  @SubscribeMessage('client-pre-sync')
  async loadDocStats(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { workspaceId, timestamp }: { workspaceId: string; timestamp?: number }
  ): Promise<EventResponse<Record<string, number>>> {
    this.assertInWorkspace(client, Sync(workspaceId));

    const stats = await this.docManager.getStats(workspaceId, timestamp);

    return {
      data: stats,
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
  ): Promise<EventResponse<{ accepted: true; timestamp?: number }>> {
    this.assertInWorkspace(client, Sync(workspaceId));

    const docId = new DocID(guid, workspaceId);
    const buffers = updates.map(update => Buffer.from(update, 'base64'));
    const timestamp = await this.docManager.batchPush(
      docId.workspace,
      docId.guid,
      buffers
    );

    client
      .to(Sync(workspaceId))
      .emit('server-updates', { workspaceId, guid, updates, timestamp });

    return {
      data: {
        accepted: true,
        timestamp,
      },
    };
  }

  @SubscribeMessage('doc-load-v2')
  async loadDocV2(
    @ConnectedSocket() client: Socket,
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
    this.assertInWorkspace(client, Sync(workspaceId));

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
    this.assertInWorkspace(client, Awareness(workspaceId));
    client.to(Awareness(workspaceId)).emit('new-client-awareness-init');
    return {
      data: {
        clientId: client.id,
      },
    };
  }

  @SubscribeMessage('awareness-update')
  async handleHelpGatheringAwareness(
    @MessageBody()
    {
      workspaceId,
      awarenessUpdate,
    }: { workspaceId: string; awarenessUpdate: string },
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    this.assertInWorkspace(client, Awareness(workspaceId));
    client
      .to(Awareness(workspaceId))
      .emit('server-awareness-broadcast', { workspaceId, awarenessUpdate });
    return {};
  }
}
