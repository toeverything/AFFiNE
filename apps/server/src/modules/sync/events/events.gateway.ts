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
    @Inject(StorageProvide) private readonly storage: Storage
  ) {}

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('client-handshake')
  async handleClientHandShake(
    @MessageBody() workspace_id: string,
    @ConnectedSocket() client: Socket
  ) {
    const docs = await this.storageService.getDocsFromWorkspaceId(workspace_id);
    await client.join(workspace_id);

    for (const { guid, update } of docs) {
      client.emit('server-handshake', {
        guid,
        update: update.toString('base64'),
      });
    }
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
    const update = Buffer.from(message.update, 'base64');
    client.to(message.workspaceId).emit('server-update', message);

    await this.docManager.push(message.workspaceId, message.guid, update);
  }

  @SubscribeMessage('init-awareness')
  async handleInitAwareness(
    @MessageBody('workspace_id') workspace_id: string,
    @ConnectedSocket() client: Socket
  ) {
    client.to(workspace_id).emit('new-client-awareness-init');
  }

  @SubscribeMessage('awareness-update')
  async handleHelpGatheringAwareness(
    @MessageBody() message: { workspaceId: string; awarenessUpdate: string },
    @ConnectedSocket() client: Socket
  ) {
    client.to(message.workspaceId).emit('server-awareness-broadcast', {
      ...message,
    });

    return 'ack';
  }
}
