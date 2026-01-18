import { applyDecorators, Logger, UseInterceptors } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage as RawSubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ClsInterceptor } from 'nestjs-cls';
import { type Server, Socket } from 'socket.io';

import {
  CallMetric,
  DocNotFound,
  DocUpdateBlocked,
  EventBus,
  GatewayErrorWrapper,
  metrics,
  NotInSpace,
  OnEvent,
  SpaceAccessDenied,
} from '../../base';
import { Models } from '../../models';
import { CurrentUser } from '../auth';
import {
  DocReader,
  DocStorageAdapter,
  PgUserspaceDocStorageAdapter,
  PgWorkspaceDocStorageAdapter,
} from '../doc';
import { AccessController, WorkspaceAction } from '../permission';
import { DocID } from '../utils/doc';

const SubscribeMessage = (event: string) =>
  applyDecorators(
    GatewayErrorWrapper(event),
    CallMetric('socketio', 'event_duration', { event }),
    RawSubscribeMessage(event)
  );

type EventResponse<Data = any> = Data extends never
  ? {
      data?: never;
    }
  : {
      data: Data;
    };

// 019 only receives space:broadcast-doc-updates and send space:push-doc-updates
// 020 only receives space:broadcast-doc-update and send space:push-doc-update
type RoomType = 'sync' | `${string}:awareness` | 'sync-019';

function Room(
  spaceId: string,
  type: RoomType = 'sync'
): `${string}:${RoomType}` {
  return `${spaceId}:${type}`;
}

enum SpaceType {
  Workspace = 'workspace',
  Userspace = 'userspace',
}

interface JoinSpaceMessage {
  spaceType: SpaceType;
  spaceId: string;
  clientVersion: string;
}

interface JoinSpaceAwarenessMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  clientVersion: string;
}

interface LeaveSpaceMessage {
  spaceType: SpaceType;
  spaceId: string;
}

interface LeaveSpaceAwarenessMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
}

/**
 * @deprecated
 */
interface PushDocUpdatesMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  updates: string[];
}

interface PushDocUpdateMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  update: string;
}

interface LoadDocMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  stateVector?: string;
}

interface DeleteDocMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
}

interface LoadDocTimestampsMessage {
  spaceType: SpaceType;
  spaceId: string;
  timestamp?: number;
}

interface LoadSpaceAwarenessesMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
}
interface UpdateAwarenessMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  awarenessUpdate: string;
}

@WebSocketGateway()
@UseInterceptors(ClsInterceptor)
export class SpaceSyncGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  protected logger = new Logger(SpaceSyncGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  private connectionCount = 0;

  constructor(
    private readonly ac: AccessController,
    private readonly event: EventBus,
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly userspace: PgUserspaceDocStorageAdapter,
    private readonly docReader: DocReader,
    private readonly models: Models
  ) {}

  handleConnection() {
    this.connectionCount++;
    this.logger.debug(`New connection, total: ${this.connectionCount}`);
    metrics.socketio.gauge('connections').record(this.connectionCount);
  }

  handleDisconnect() {
    this.connectionCount--;
    this.logger.debug(
      `Connection disconnected, total: ${this.connectionCount}`
    );
    metrics.socketio.gauge('connections').record(this.connectionCount);
  }

  @OnEvent('doc.updates.pushed')
  onDocUpdatesPushed({
    spaceType,
    spaceId,
    docId,
    updates,
    timestamp,
    editor,
  }: Events['doc.updates.pushed']) {
    if (!this.server || updates.length === 0) {
      return;
    }

    const encodedUpdates = updates.map(update =>
      Buffer.from(update).toString('base64')
    );

    this.server
      .to(Room(spaceId, 'sync-019'))
      .emit('space:broadcast-doc-updates', {
        spaceType,
        spaceId,
        docId,
        updates: encodedUpdates,
        timestamp,
      });

    const room = `${spaceType}:${Room(spaceId)}`;
    encodedUpdates.forEach(update => {
      this.server.to(room).emit('space:broadcast-doc-update', {
        spaceType,
        spaceId,
        docId,
        update,
        timestamp,
        editor,
      });
    });
  }

  selectAdapter(client: Socket, spaceType: SpaceType): SyncSocketAdapter {
    let adapters: Record<SpaceType, SyncSocketAdapter> = (client as any)
      .affineSyncAdapters;

    if (!adapters) {
      const workspace = new WorkspaceSyncAdapter(
        client,
        this.workspace,
        this.ac,
        this.docReader,
        this.models
      );
      const userspace = new UserspaceSyncAdapter(client, this.userspace);

      adapters = { workspace, userspace };
      (client as any).affineSyncAdapters = adapters;
    }

    return adapters[spaceType];
  }

  // v3
  @SubscribeMessage('space:join')
  async onJoinSpace(
    @CurrentUser() user: CurrentUser,
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { spaceType, spaceId, clientVersion }: JoinSpaceMessage
  ): Promise<EventResponse<{ clientId: string; success: boolean }>> {
    if (
      ![SpaceType.Userspace, SpaceType.Workspace].includes(spaceType) ||
      /^0.1/.test(clientVersion)
    ) {
      return { data: { clientId: client.id, success: false } };
    } else {
      if (spaceType === SpaceType.Workspace) {
        this.event.emit('workspace.embedding', { workspaceId: spaceId });
      }
      await this.selectAdapter(client, spaceType).join(user.id, spaceId);
    }

    return { data: { clientId: client.id, success: true } };
  }

  @SubscribeMessage('space:leave')
  async onLeaveSpace(
    @ConnectedSocket() client: Socket,
    @MessageBody() { spaceType, spaceId }: LeaveSpaceMessage
  ): Promise<EventResponse<{ clientId: string; success: true }>> {
    await this.selectAdapter(client, spaceType).leave(spaceId);

    return { data: { clientId: client.id, success: true } };
  }

  @SubscribeMessage('space:load-doc')
  async onLoadSpaceDoc(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { spaceType, spaceId, docId, stateVector }: LoadDocMessage
  ): Promise<
    EventResponse<{ missing: string; state: string; timestamp: number }>
  > {
    const id = new DocID(docId, spaceId);
    const adapter = this.selectAdapter(client, spaceType);
    adapter.assertIn(spaceId);

    const doc = await adapter.diff(
      spaceId,
      id.guid,
      stateVector ? Buffer.from(stateVector, 'base64') : undefined
    );

    if (!doc) {
      throw new DocNotFound({ spaceId, docId });
    }

    return {
      data: {
        missing: Buffer.from(doc.missing).toString('base64'),
        state: Buffer.from(doc.state).toString('base64'),
        timestamp: doc.timestamp,
      },
    };
  }

  @SubscribeMessage('space:delete-doc')
  async onDeleteSpaceDoc(
    @ConnectedSocket() client: Socket,
    @MessageBody() { spaceType, spaceId, docId }: DeleteDocMessage
  ) {
    const adapter = this.selectAdapter(client, spaceType);
    await adapter.delete(spaceId, docId);
  }

  /**
   * @deprecated use [space:push-doc-update] instead, client should always merge updates on their own
   *
   * only 0.19.x client will send this event
   */
  @SubscribeMessage('space:push-doc-updates')
  async onReceiveDocUpdates(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser,
    @MessageBody()
    message: PushDocUpdatesMessage
  ): Promise<EventResponse<{ accepted: true; timestamp?: number }>> {
    const { spaceType, spaceId, docId, updates } = message;
    const adapter = this.selectAdapter(client, spaceType);
    const id = new DocID(docId, spaceId);

    // TODO(@forehalo): enable after frontend supporting doc revert
    // await this.ac.user(user.id).doc(spaceId, id.guid).assert('Doc.Update');
    const timestamp = await adapter.push(
      spaceId,
      id.guid,
      updates.map(update => Buffer.from(update, 'base64')),
      user.id
    );

    // broadcast to 0.19.x clients
    client
      .to(Room(spaceId, 'sync-019'))
      .emit('space:broadcast-doc-updates', { ...message, timestamp });

    // broadcast to new clients
    updates.forEach(update => {
      client.to(adapter.room(spaceId)).emit('space:broadcast-doc-update', {
        ...message,
        update,
        timestamp,
      });
    });

    return {
      data: {
        accepted: true,
        timestamp,
      },
    };
  }

  @SubscribeMessage('space:push-doc-update')
  async onReceiveDocUpdate(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser,
    @MessageBody()
    message: PushDocUpdateMessage
  ): Promise<EventResponse<{ accepted: true; timestamp?: number }>> {
    const { spaceType, spaceId, docId, update } = message;
    const adapter = this.selectAdapter(client, spaceType);

    // TODO(@forehalo): enable after frontend supporting doc revert
    // await this.ac.user(user.id).doc(spaceId, docId).assert('Doc.Update');
    const timestamp = await adapter.push(
      spaceId,
      docId,
      [Buffer.from(update, 'base64')],
      user.id
    );

    // broadcast to 0.19.x clients
    client.to(Room(spaceId, 'sync-019')).emit('space:broadcast-doc-updates', {
      spaceType,
      spaceId,
      docId,
      updates: [update],
      timestamp,
    });

    client.to(adapter.room(spaceId)).emit('space:broadcast-doc-update', {
      spaceType,
      spaceId,
      docId,
      update,
      timestamp,
      editor: user.id,
    });

    return {
      data: {
        accepted: true,
        timestamp,
      },
    };
  }

  @SubscribeMessage('space:load-doc-timestamps')
  async onLoadDocTimestamps(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { spaceType, spaceId, timestamp }: LoadDocTimestampsMessage
  ): Promise<EventResponse<Record<string, number>>> {
    const adapter = this.selectAdapter(client, spaceType);

    const stats = await adapter.getTimestamps(spaceId, timestamp);

    return {
      data: stats ?? {},
    };
  }

  @SubscribeMessage('space:join-awareness')
  async onJoinAwareness(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser,
    @MessageBody()
    { spaceType, spaceId, docId }: JoinSpaceAwarenessMessage
  ) {
    await this.selectAdapter(client, spaceType).join(
      user.id,
      spaceId,
      `${docId}:awareness`
    );

    return { data: { clientId: client.id, success: true } };
  }

  @SubscribeMessage('space:leave-awareness')
  async onLeaveAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { spaceType, spaceId, docId }: LeaveSpaceAwarenessMessage
  ) {
    await this.selectAdapter(client, spaceType).leave(
      spaceId,
      `${docId}:awareness`
    );

    return { data: { clientId: client.id, success: true } };
  }

  @SubscribeMessage('space:load-awarenesses')
  async onLoadAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { spaceType, spaceId, docId }: LoadSpaceAwarenessesMessage
  ) {
    const adapter = this.selectAdapter(client, spaceType);

    const roomType = `${docId}:awareness` as const;
    adapter.assertIn(spaceId, roomType);
    client
      .to(adapter.room(spaceId, roomType))
      .emit('space:collect-awareness', { spaceType, spaceId, docId });

    // TODO(@forehalo): remove backward compatibility
    if (spaceType === SpaceType.Workspace) {
      client
        .to(adapter.room(spaceId, roomType))
        .emit('new-client-awareness-init');
    }

    return { data: { clientId: client.id } };
  }

  @SubscribeMessage('space:update-awareness')
  async onUpdateAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: UpdateAwarenessMessage
  ) {
    const { spaceType, spaceId, docId } = message;
    const adapter = this.selectAdapter(client, spaceType);

    const roomType = `${docId}:awareness` as const;
    adapter.assertIn(spaceId, roomType);
    client
      .to(adapter.room(spaceId, roomType))
      .emit('space:broadcast-awareness-update', message);

    return {};
  }
}

abstract class SyncSocketAdapter {
  constructor(
    private readonly spaceType: SpaceType,
    public readonly client: Socket,
    public readonly storage: DocStorageAdapter
  ) {}

  room(spaceId: string, roomType: RoomType = 'sync') {
    return `${this.spaceType}:${Room(spaceId, roomType)}`;
  }

  async join(userId: string, spaceId: string, roomType: RoomType = 'sync') {
    if (this.in(spaceId, roomType)) {
      return;
    }
    await this.assertAccessible(spaceId, userId, 'Workspace.Sync');
    return this.client.join(this.room(spaceId, roomType));
  }

  async leave(spaceId: string, roomType: RoomType = 'sync') {
    if (!this.in(spaceId, roomType)) {
      return;
    }
    return this.client.leave(this.room(spaceId, roomType));
  }

  in(spaceId: string, roomType: RoomType = 'sync') {
    return this.client.rooms.has(this.room(spaceId, roomType));
  }

  assertIn(spaceId: string, roomType: RoomType = 'sync') {
    if (!this.client.rooms.has(this.room(spaceId, roomType))) {
      throw new NotInSpace({ spaceId });
    }
  }

  abstract assertAccessible(
    spaceId: string,
    userId: string,
    action: WorkspaceAction
  ): Promise<void>;

  async push(
    spaceId: string,
    docId: string,
    updates: Buffer[],
    editorId: string
  ) {
    this.assertIn(spaceId);
    return await this.storage.pushDocUpdates(spaceId, docId, updates, editorId);
  }

  diff(spaceId: string, docId: string, stateVector?: Uint8Array) {
    this.assertIn(spaceId);
    return this.storage.getDocDiff(spaceId, docId, stateVector);
  }

  delete(spaceId: string, docId: string) {
    this.assertIn(spaceId);
    return this.storage.deleteDoc(spaceId, docId);
  }

  getTimestamps(spaceId: string, timestamp?: number) {
    this.assertIn(spaceId);
    return this.storage.getSpaceDocTimestamps(spaceId, timestamp);
  }
}

class WorkspaceSyncAdapter extends SyncSocketAdapter {
  constructor(
    client: Socket,
    storage: DocStorageAdapter,
    private readonly ac: AccessController,
    private readonly docReader: DocReader,
    private readonly models: Models
  ) {
    super(SpaceType.Workspace, client, storage);
  }

  override async push(
    spaceId: string,
    docId: string,
    updates: Buffer[],
    editorId: string
  ) {
    const docMeta = await this.models.doc.getMeta(spaceId, docId, {
      select: {
        blocked: true,
      },
    });
    if (docMeta?.blocked) {
      throw new DocUpdateBlocked({ spaceId, docId });
    }
    return await super.push(spaceId, docId, updates, editorId);
  }

  override async diff(
    spaceId: string,
    docId: string,
    stateVector?: Uint8Array
  ) {
    return await this.docReader.getDocDiff(spaceId, docId, stateVector);
  }

  async assertAccessible(
    spaceId: string,
    userId: string,
    action: WorkspaceAction
  ) {
    await this.ac.user(userId).workspace(spaceId).assert(action);
  }
}

class UserspaceSyncAdapter extends SyncSocketAdapter {
  constructor(client: Socket, storage: DocStorageAdapter) {
    super(SpaceType.Userspace, client, storage);
  }

  async assertAccessible(
    spaceId: string,
    userId: string,
    _action: WorkspaceAction
  ) {
    if (spaceId !== userId) {
      throw new SpaceAccessDenied({ spaceId });
    }
  }
}
