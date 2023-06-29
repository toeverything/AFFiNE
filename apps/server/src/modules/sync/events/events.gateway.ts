import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import * as Y from 'yjs';
import { Doc } from 'yjs';

import { base64ToUint8Array, DocUpdate, uint8ArrayToBase64 } from '../utils';

@WebSocketGateway()
export class EventsGateway {
  @WebSocketServer()
  server: any;

  @SubscribeMessage('client-handshake')
  async handleClientHandShake(
    @MessageBody() workspace_id: string,
    @ConnectedSocket() client: Socket
  ) {
    const docs = await getDocsFromWorkspaceId(workspace_id);

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
    @MessageBody() message: { guid: string; update: string }
  ) {
    const update = base64ToUint8Array(message.update);
    this.server.to(message.guid).emit('server-update', message);
    await saveWorkspaceUpdate({ guid: message.guid, update });
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
    @MessageBody() message: { workspace_id: string; awarenessUpdate: string }
  ) {
    this.server
      .to(`awareness-${message.workspace_id}`)
      .emit('server-awareness-broadcast', {
        ...message,
        awarenessUpdate: base64ToUint8Array(message.awarenessUpdate),
      });
  }
}

const getDocsFromWorkspaceId = async (
  _workspace_id: string
): Promise<
  Array<{
    guid: string;
    update: Uint8Array;
  }>
> => {
  const result: Array<{
    guid: string;
    update: Uint8Array;
  }> = [];
  // get Array<Uint8Array> from db
  // deep find yDoc.subdocs，get subdoc from db, append to result
  return result;
};

const _getDocFromGuid = async (_guid: string): Promise<Doc> => {
  const updates: Array<Uint8Array> = [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([1, 2, 3]),
  ]; // TODO get from database
  const doc = new Y.Doc();
  updates.forEach(update => {
    Y.applyUpdate(doc, update);
  });

  return doc;
};

const saveWorkspaceUpdate = async (_docUpdate: DocUpdate) => {
  // save to db
  console.log('saveWorkspaceUpdate');
};
