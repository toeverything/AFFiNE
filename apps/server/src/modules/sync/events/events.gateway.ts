import { Storage } from '@affine/storage';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

import { base64ToUint8Array, uint8ArrayToBase64 } from '../utils';
import { WorkspaceService } from './workspace';

const port = parseInt(process.env.PORT ?? '3010');

@WebSocketGateway(port)
export class EventsGateway {
  constructor(
    private readonly storageService: WorkspaceService,
    private readonly storage: Storage
  ) {}

  @WebSocketServer()
  server: any;

  @SubscribeMessage('client-handshake')
  async handleClientHandShake(
    @MessageBody() workspace_id: string,
    @ConnectedSocket() client: Socket
  ) {
    const docs = await this.storageService.getDocsFromWorkspaceId(workspace_id);

    for (const { guid, update } of docs) {
      await client.join(guid);
      client.emit('server-handshake', {
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
    const update = base64ToUint8Array(message.update);
    this.server.to(message.guid).emit('server-update', message);

    await this.storage.sync(
      message.workspaceId,
      message.guid,
      Buffer.from(update)
    );
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
