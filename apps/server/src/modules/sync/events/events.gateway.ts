import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { encodeStateAsUpdate, encodeStateVector } from 'yjs';

import { Metrics } from '../../../metrics/metrics';
import { trimGuid } from '../../../utils/doc';
import { Auth, CurrentUser } from '../../auth';
import { DocManager } from '../../doc';
import { UserType } from '../../users';
import { PermissionService } from '../../workspaces/permission';
import { Permission } from '../../workspaces/types';

@WebSocketGateway({
  cors: process.env.NODE_ENV !== 'production',
  transports: ['websocket'],
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
  ) {
    this.metric.socketIOEventCounter(1, { event: 'client-handshake' });
    const endTimer = this.metric.socketIOEventTimer({
      event: 'client-handshake',
    });

    const canWrite = await this.permissions.tryCheck(
      workspaceId,
      user.id,
      Permission.Write
    );
    if (canWrite) await client.join(workspaceId);

    endTimer();
    return canWrite;
  }

  @SubscribeMessage('client-leave')
  async handleClientLeave(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ) {
    this.metric.socketIOEventCounter(1, { event: 'client-leave' });
    const endTimer = this.metric.socketIOEventTimer({
      event: 'client-leave',
    });
    await client.leave(workspaceId);
    endTimer();
  }

  @SubscribeMessage('client-update')
  async handleClientUpdate(
    @MessageBody()
    message: {
      workspaceId: string;
      guid: string;
      update: string;
    },
    @ConnectedSocket() client: Socket
  ) {
    this.metric.socketIOEventCounter(1, { event: 'client-update' });
    const endTimer = this.metric.socketIOEventTimer({ event: 'client-update' });
    if (!client.rooms.has(message.workspaceId)) {
      this.logger.verbose(
        `Client ${client.id} tried to push update to workspace ${message.workspaceId} without joining it first`
      );
      endTimer();
      return;
    }

    const update = Buffer.from(message.update, 'base64');
    client.to(message.workspaceId).emit('server-update', message);

    const guid = trimGuid(message.workspaceId, message.guid);
    await this.docManager.push(message.workspaceId, guid, update);

    endTimer();
  }

  @Auth()
  @SubscribeMessage('doc-load')
  async loadDoc(
    @CurrentUser() user: UserType,
    @MessageBody()
    message: {
      workspaceId: string;
      guid: string;
      stateVector?: string;
      targetClientId?: number;
    },
    @ConnectedSocket() client: Socket
  ): Promise<{ missing: string; state?: string } | false> {
    this.metric.socketIOEventCounter(1, { event: 'doc-load' });
    const endTimer = this.metric.socketIOEventTimer({ event: 'doc-load' });
    if (!client.rooms.has(message.workspaceId)) {
      const canRead = await this.permissions.tryCheck(
        message.workspaceId,
        user.id
      );
      if (!canRead) {
        endTimer();
        return false;
      }
    }

    const guid = trimGuid(message.workspaceId, message.guid);
    const doc = await this.docManager.get(message.workspaceId, guid);

    if (!doc) {
      endTimer();
      return false;
    }

    const missing = Buffer.from(
      encodeStateAsUpdate(
        doc,
        message.stateVector
          ? Buffer.from(message.stateVector, 'base64')
          : undefined
      )
    ).toString('base64');
    const state = Buffer.from(encodeStateVector(doc)).toString('base64');

    endTimer();
    return {
      missing,
      state,
    };
  }

  @SubscribeMessage('awareness-init')
  async handleInitAwareness(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ) {
    this.metric.socketIOEventCounter(1, { event: 'awareness-init' });
    const endTimer = this.metric.socketIOEventTimer({
      event: 'init-awareness',
    });
    if (client.rooms.has(workspaceId)) {
      client.to(workspaceId).emit('new-client-awareness-init');
    } else {
      this.logger.verbose(
        `Client ${client.id} tried to init awareness for workspace ${workspaceId} without joining it first`
      );
    }
    endTimer();
  }

  @SubscribeMessage('awareness-update')
  async handleHelpGatheringAwareness(
    @MessageBody() message: { workspaceId: string; awarenessUpdate: string },
    @ConnectedSocket() client: Socket
  ) {
    this.metric.socketIOEventCounter(1, { event: 'awareness-update' });
    const endTimer = this.metric.socketIOEventTimer({
      event: 'awareness-update',
    });

    if (client.rooms.has(message.workspaceId)) {
      client.to(message.workspaceId).emit('server-awareness-broadcast', {
        ...message,
      });
    } else {
      this.logger.verbose(
        `Client ${client.id} tried to update awareness for workspace ${message.workspaceId} without joining it first`
      );
    }

    endTimer();
    return 'ack';
  }
}
