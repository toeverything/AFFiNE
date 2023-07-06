import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

import { PrismaService } from '../../../prisma';
import { uint8ArrayToBase64 } from '../utils';
import { WorkspaceService } from './workspace';

@WebSocketGateway({
  cors: process.env.NODE_ENV !== 'production',
})
export class EventsGateway {
  constructor(
    private readonly storageService: WorkspaceService,
    private prisma: PrismaService
  ) {}

  @WebSocketServer()
  server: any;

  @SubscribeMessage('client-handshake')
  async handleClientHandShake(
    @MessageBody() workspace_id: string,
    @ConnectedSocket() client: Socket
  ) {
    const docs = await this.storageService.getDocsFromWorkspaceId(workspace_id);
    await client.join(workspace_id);

    for (const { guid, update } of docs) {
      this.server.to(workspace_id).emit('server-handshake', {
        guid,
        update: uint8ArrayToBase64(update),
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
    }
  ) {
    const update = Buffer.from(message.update, 'base64');
    this.server.to(message.workspaceId).emit('server-update', message);

    // TODO replace with publishing directly to message queue
    await this.prisma.doc.create({
      data: {
        workspaceId: message.workspaceId,
        guid: message.guid,
        is_workspace: message.workspaceId == message.guid,
        blob: update,
      },
    });
  }

  @SubscribeMessage('init-awareness')
  async handleInitAwareness(
    @MessageBody('workspace_id') workspace_id: string,
    @ConnectedSocket() client: Socket
  ) {
    const roomId = `awareness-${workspace_id}`;
    await client.join(roomId);
    this.server.to(roomId).emit('new-client-awareness-init');
  }

  @SubscribeMessage('awareness-update')
  async handleHelpGatheringAwareness(
    @MessageBody() message: { workspaceId: string; awarenessUpdate: string }
  ) {
    this.server
      .to(`awareness-${message.workspaceId}`)
      .emit('server-awareness-broadcast', {
        ...message,
      });
  }
}
