import type { Schema } from '@blocksuite/store';
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
import { Doc as YDoc, Map as YMap } from 'yjs';

import { Metrics } from '../../../metrics/metrics';
import { trimGuid } from '../../../utils/doc';
import { DocManager } from '../../doc';

@WebSocketGateway({
  cors: process.env.NODE_ENV !== 'production',
  transports: ['websocket'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private connectionCount = 0;
  private schema: Schema | null = null;

  constructor(
    private readonly docManager: DocManager,
    private readonly metric: Metrics
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

  @SubscribeMessage('client-handshake')
  async handleClientHandShake(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ) {
    this.metric.socketIOEventCounter(1, { event: 'client-handshake' });
    const endTimer = this.metric.socketIOEventTimer({
      event: 'client-handshake',
    });
    await client.join(workspaceId);
    endTimer();
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
    const update = Buffer.from(message.update, 'base64');
    client.to(message.workspaceId).emit('server-update', message);
    const guid = trimGuid(message.workspaceId, message.guid);

    await this.docManager.push(message.workspaceId, guid, update);
    endTimer();
  }

  @SubscribeMessage('doc-load')
  async loadDoc(
    @MessageBody()
    message: {
      workspaceId: string;
      guid: string;
      stateVector?: string;
      targetClientId?: number;
    }
  ): Promise<{ missing: string; state?: string } | false> {
    this.metric.socketIOEventCounter(1, { event: 'doc-load' });
    const endTimer = this.metric.socketIOEventTimer({ event: 'doc-load' });
    const guid = trimGuid(message.workspaceId, message.guid);
    const doc = await this.docManager.getLatest(message.workspaceId, guid);

    if (!doc) {
      endTimer();
      return false;
    }

    // check migration in the rootDoc
    if (message.workspaceId === message.guid) {
      const blockVersions = doc.getMap('meta').get('blockVersions');
      if (blockVersions instanceof YMap) {
        const currentVersions = blockVersions.toJSON() as Record<
          string,
          number
        >;
        if (!this.schema) {
          const { Schema } = await import('@blocksuite/store');
          const { AffineSchemas, __unstableSchemas } = await import(
            '@blocksuite/blocks/models'
          );
          this.schema = new Schema();
          this.schema.register(AffineSchemas).register(__unstableSchemas);
        }
        const needUpgrade = [...this.schema.flavourSchemaMap.entries()].some(
          ([key, value]) => {
            const currentVersion = currentVersions[key];
            return currentVersion !== value.version;
          }
        );
        if (needUpgrade) {
          const schema = this.schema;
          const subdocs = await Promise.all(
            [...doc.subdocs.values()].map(subdoc =>
              this.docManager.getLatest(message.workspaceId, subdoc.guid)
            )
          );

          await Promise.all(
            subdocs
              .filter((v): v is YDoc => !!v)
              // always upgrade the page doc to the latest version
              .map(subdoc => schema.upgradePage(currentVersions, subdoc))
          ).then(() =>
            subdocs
              .filter((v): v is YDoc => !!v)
              .map(subdoc =>
                this.docManager.push(
                  message.workspaceId,
                  subdoc.guid,
                  Buffer.from(encodeStateAsUpdate(subdoc))
                )
              )
          );

          await this.docManager.apply();
        }
      }
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
    client.to(workspaceId).emit('new-client-awareness-init');
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
    client.to(message.workspaceId).emit('server-awareness-broadcast', {
      ...message,
    });

    endTimer();
    return 'ack';
  }
}
