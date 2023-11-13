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

import { Metrics } from '../../../metrics/metrics';
import { CallCounter, CallTimer } from '../../../metrics/utils';
import { DocID } from '../../../utils/doc';
import { Auth, CurrentUser } from '../../auth';
import { DocManager } from '../../doc';
import { UserType } from '../../users';
import { PermissionService } from '../../workspaces/permission';
import { Permission } from '../../workspaces/types';
import {
  AccessDeniedError,
  DocNotFoundError,
  EventError,
  InternalError,
  NotInWorkspaceError,
  WorkspaceNotFoundError,
} from './error';

const SubscribeMessage = (event: string) =>
  applyDecorators(
    CallCounter('socket_io_counter', { event }),
    CallTimer('socket_io_timer', { event }),
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
    private readonly metric: Metrics,
    private readonly permissions: PermissionService
  ) {}

  @WebSocketServer()
  server!: Server;

  handleConnection() {
    this.connectionCount++;
    this.metric.socketIOConnectionGauge(this.connectionCount, {});
  }

  handleDisconnect() {
    this.connectionCount--;
    this.metric.socketIOConnectionGauge(this.connectionCount, {});
  }

  @Auth()
  @SubscribeMessage('client-handshake')
  async handleClientHandShake(
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
      await client.join(workspaceId);
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

  @SubscribeMessage('client-leave')
  async handleClientLeave(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    if (client.rooms.has(workspaceId)) {
      await client.leave(workspaceId);
      return {};
    } else {
      return {
        error: new NotInWorkspaceError(workspaceId),
      };
    }
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
    if (!client.rooms.has(workspaceId)) {
      this.logger.verbose(
        `Client ${client.id} tried to push update to workspace ${workspaceId} without joining it first`
      );
      return;
    }

    const docId = new DocID(guid, workspaceId);

    client
      .to(docId.workspace)
      .emit('server-update', { workspaceId, guid, update });

    // broadcast to all clients with newer version that only listen to `server-updates`
    client
      .to(docId.workspace)
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
    if (!client.rooms.has(workspaceId)) {
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
    if (!client.rooms.has(workspaceId)) {
      return {
        error: new NotInWorkspaceError(workspaceId),
      };
    }

    try {
      const docId = new DocID(guid, workspaceId);
      client
        .to(docId.workspace)
        .emit('server-updates', { workspaceId, guid, updates });

      const buffers = updates.map(update => Buffer.from(update, 'base64'));

      await this.docManager.batchPush(docId.workspace, docId.guid, buffers);
      return {
        data: {
          accepted: true,
        },
      };
    } catch (e) {
      return {
        error: new InternalError(e as Error),
      };
    }
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
    if (!client.rooms.has(workspaceId)) {
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
        error: docId.isWorkspace
          ? new WorkspaceNotFoundError(workspaceId)
          : new DocNotFoundError(workspaceId, docId.guid),
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
    if (client.rooms.has(workspaceId)) {
      client.to(workspaceId).emit('new-client-awareness-init');
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
    if (client.rooms.has(message.workspaceId)) {
      client
        .to(message.workspaceId)
        .emit('server-awareness-broadcast', message);
      return {};
    } else {
      return {
        error: new NotInWorkspaceError(message.workspaceId),
      };
    }
  }
}
