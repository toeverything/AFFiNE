import type { Storage } from '@affine/storage';
import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { Metrics } from '../../../metrics/metrics';
import { StorageProvide } from '../../../storage';
import { DocManager } from '../../doc';
import { WorkspaceService } from './workspace';

@WebSocketGateway({
  cors: process.env.NODE_ENV !== 'production',
})
export class EventsGateway {
  constructor(
    private readonly storageService: WorkspaceService,
    private readonly docManager: DocManager,
    @Inject(StorageProvide) private readonly storage: Storage,
    private readonly metric: Metrics
  ) {}

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('client-handshake')
  async handleClientHandShake(
    @MessageBody() workspace_id: string,
    @ConnectedSocket() client: Socket
  ) {
    this.metric.socketIOCounter(1, { event: 'client-handshake' });
    const endTimer = this.metric.socketIOTimer({ event: 'client-handshake' });
    const docs = await this.storageService.getDocsFromWorkspaceId(workspace_id);
    await client.join(workspace_id);

    for (const { guid, update } of docs) {
      client.emit('server-handshake', {
        guid,
        update: update.toString('base64'),
      });
    }
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
    this.metric.socketIOCounter(1, { event: 'client-update' });
    const endTimer = this.metric.socketIOTimer({ event: 'client-update' });
    const update = Buffer.from(message.update, 'base64');
    client.to(message.workspaceId).emit('server-update', message);

    await this.docManager.push(message.workspaceId, message.guid, update);
    endTimer();
  }

  @SubscribeMessage('init-awareness')
  async handleInitAwareness(
    @MessageBody('workspace_id') workspace_id: string,
    @ConnectedSocket() client: Socket
  ) {
    this.metric.socketIOCounter(1, { event: 'init-awareness' });
    const endTimer = this.metric.socketIOTimer({ event: 'init-awareness' });
    client.to(workspace_id).emit('new-client-awareness-init');
    endTimer();
  }

  @SubscribeMessage('awareness-update')
  async handleHelpGatheringAwareness(
    @MessageBody() message: { workspaceId: string; awarenessUpdate: string },
    @ConnectedSocket() client: Socket
  ) {
    this.metric.socketIOCounter(1, { event: 'awareness-update' });
    const endTimer = this.metric.socketIOTimer({ event: 'awareness-update' });
    client.to(message.workspaceId).emit('server-awareness-broadcast', {
      ...message,
    });

    endTimer();
    return 'ack';
  }
}
