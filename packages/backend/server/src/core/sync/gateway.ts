import { applyDecorators, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage as RawSubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { diffUpdate, encodeStateVectorFromUpdate } from 'yjs';

import {
  AlreadyInSpace,
  CallMetric,
  Config,
  DocNotFound,
  GatewayErrorWrapper,
  metrics,
  NotInSpace,
  SpaceAccessDenied,
  VersionRejected,
} from '../../fundamentals';
import { CurrentUser } from '../auth';
import {
  DocStorageAdapter,
  PgUserspaceDocStorageAdapter,
  PgWorkspaceDocStorageAdapter,
} from '../doc';
import { Permission, PermissionService } from '../permission';
import { DocID } from '../utils/doc';

const SubscribeMessage = (event: string) =>
  applyDecorators(
    GatewayErrorWrapper(event),
    CallMetric('socketio', 'event_duration', undefined, { event }),
    RawSubscribeMessage(event)
  );

type EventResponse<Data = any> = Data extends never
  ? {
      data?: never;
    }
  : {
      data: Data;
    };

type RoomType = 'sync' | `${string}:awareness`;

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

interface PushDocUpdatesMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  updates: string[];
}

interface LoadDocMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  stateVector?: string;
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
export class SpaceSyncGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  protected logger = new Logger(SpaceSyncGateway.name);

  private connectionCount = 0;

  constructor(
    private readonly config: Config,
    private readonly permissions: PermissionService,
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly userspace: PgUserspaceDocStorageAdapter
  ) {}

  handleConnection() {
    this.connectionCount++;
    metrics.socketio.gauge('realtime_connections').record(this.connectionCount);
  }

  handleDisconnect() {
    this.connectionCount--;
    metrics.socketio.gauge('realtime_connections').record(this.connectionCount);
  }

  selectAdapter(client: Socket, spaceType: SpaceType): SyncSocketAdapter {
    let adapters: Record<SpaceType, SyncSocketAdapter> = (client as any)
      .affineSyncAdapters;

    if (!adapters) {
      const workspace = new WorkspaceSyncAdapter(
        client,
        this.workspace,
        this.permissions
      );
      const userspace = new UserspaceSyncAdapter(client, this.userspace);

      adapters = { workspace, userspace };
      (client as any).affineSyncAdapters = adapters;
    }

    return adapters[spaceType];
  }

  async assertVersion(client: Socket, version?: string) {
    const shouldCheckClientVersion = await this.config.runtime.fetch(
      'flags/syncClientVersionCheck'
    );
    if (
      // @todo(@darkskygit): remove this flag after 0.12 goes stable
      shouldCheckClientVersion &&
      version !== AFFiNE.version
    ) {
      client.emit('server-version-rejected', {
        currentVersion: version,
        requiredVersion: AFFiNE.version,
        reason: `Client version${
          version ? ` ${version}` : ''
        } is outdated, please update to ${AFFiNE.version}`,
      });

      throw new VersionRejected({
        version: version || 'unknown',
        serverVersion: AFFiNE.version,
      });
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
      throw new NotInSpace({ spaceId: room.split(':')[0] });
    }
  }

  // v3
  @SubscribeMessage('space:join')
  async onJoinSpace(
    @CurrentUser() user: CurrentUser,
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { spaceType, spaceId, clientVersion }: JoinSpaceMessage
  ): Promise<EventResponse<{ clientId: string; success: true }>> {
    await this.assertVersion(client, clientVersion);

    await this.selectAdapter(client, spaceType).join(user.id, spaceId);

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
    EventResponse<{ missing: string; state?: string; timestamp: number }>
  > {
    const adapter = this.selectAdapter(client, spaceType);
    adapter.assertIn(spaceId);

    const doc = await adapter.get(spaceId, docId);

    if (!doc) {
      throw new DocNotFound({ spaceId, docId });
    }

    const missing = Buffer.from(
      stateVector
        ? diffUpdate(doc.bin, Buffer.from(stateVector, 'base64'))
        : doc.bin
    ).toString('base64');

    const state = Buffer.from(encodeStateVectorFromUpdate(doc.bin)).toString(
      'base64'
    );

    return {
      data: {
        missing,
        state,
        timestamp: doc.timestamp,
      },
    };
  }

  @SubscribeMessage('space:push-doc-updates')
  async onReceiveDocUpdates(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser,
    @MessageBody()
    message: PushDocUpdatesMessage
  ): Promise<EventResponse<{ accepted: true; timestamp?: number }>> {
    const { spaceType, spaceId, docId, updates } = message;
    const adapter = this.selectAdapter(client, spaceType);

    // TODO(@forehalo): we might need to check write permission before push updates
    const timestamp = await adapter.push(
      spaceId,
      docId,
      updates.map(update => Buffer.from(update, 'base64')),
      user.id
    );

    // could be put in [adapter.push]
    // but the event should be kept away from adapter
    // so
    client
      .to(adapter.room(spaceId))
      .emit('space:broadcast-doc-updates', { ...message, timestamp });

    // TODO(@forehalo): remove backward compatibility
    if (spaceType === SpaceType.Workspace) {
      const id = new DocID(docId, spaceId);
      client.to(adapter.room(spaceId)).emit('server-updates', {
        workspaceId: spaceId,
        guid: id.guid,
        updates,
        timestamp,
      });
    }

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
    { spaceType, spaceId, docId, clientVersion }: JoinSpaceAwarenessMessage
  ) {
    await this.assertVersion(client, clientVersion);

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

    // TODO(@forehalo): remove backward compatibility
    if (spaceType === SpaceType.Workspace) {
      client
        .to(adapter.room(spaceId, roomType))
        .emit('server-awareness-broadcast', {
          workspaceId: spaceId,
          awarenessUpdate: message.awarenessUpdate,
        });
    }

    return {};
  }

  // TODO(@forehalo): remove
  // deprecated section
  @SubscribeMessage('client-handshake-sync')
  async handleClientHandshakeSync(
    @CurrentUser() user: CurrentUser,
    @MessageBody('workspaceId') workspaceId: string,
    @MessageBody('version') version: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    await this.assertVersion(client, version);

    return this.onJoinSpace(user, client, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      clientVersion: version,
    });
  }

  @SubscribeMessage('client-leave-sync')
  async handleLeaveSync(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    return this.onLeaveSpace(client, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
    });
  }

  @SubscribeMessage('client-pre-sync')
  async loadDocStats(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { workspaceId, timestamp }: { workspaceId: string; timestamp?: number }
  ): Promise<EventResponse<Record<string, number>>> {
    return this.onLoadDocTimestamps(client, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      timestamp,
    });
  }

  @SubscribeMessage('client-update-v2')
  async handleClientUpdateV2(
    @CurrentUser() user: CurrentUser,
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
    return this.onReceiveDocUpdates(client, user, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      docId: guid,
      updates,
    });
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
  ): Promise<
    EventResponse<{ missing: string; state?: string; timestamp: number }>
  > {
    return this.onLoadSpaceDoc(client, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      docId: guid,
      stateVector,
    });
  }

  @SubscribeMessage('client-handshake-awareness')
  async handleClientHandshakeAwareness(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser,
    @MessageBody('workspaceId') workspaceId: string,
    @MessageBody('version') version: string
  ): Promise<EventResponse<{ clientId: string }>> {
    return this.onJoinAwareness(client, user, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      docId: workspaceId,
      clientVersion: version,
    });
  }

  @SubscribeMessage('client-leave-awareness')
  async handleLeaveAwareness(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse> {
    return this.onLeaveAwareness(client, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      docId: workspaceId,
    });
  }

  @SubscribeMessage('awareness-init')
  async handleInitAwareness(
    @MessageBody() workspaceId: string,
    @ConnectedSocket() client: Socket
  ): Promise<EventResponse<{ clientId: string }>> {
    return this.onLoadAwareness(client, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      docId: workspaceId,
    });
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
    return this.onUpdateAwareness(client, {
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      docId: workspaceId,
      awarenessUpdate,
    });
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
    this.assertNotIn(spaceId, roomType);
    await this.assertAccessible(spaceId, userId, Permission.Read);
    return this.client.join(this.room(spaceId, roomType));
  }

  async leave(spaceId: string, roomType: RoomType = 'sync') {
    this.assertIn(spaceId, roomType);
    return this.client.leave(this.room(spaceId, roomType));
  }

  in(spaceId: string, roomType: RoomType = 'sync') {
    return this.client.rooms.has(this.room(spaceId, roomType));
  }

  assertNotIn(spaceId: string, roomType: RoomType = 'sync') {
    if (this.client.rooms.has(this.room(spaceId, roomType))) {
      throw new AlreadyInSpace({ spaceId });
    }
  }

  assertIn(spaceId: string, roomType: RoomType = 'sync') {
    if (!this.client.rooms.has(this.room(spaceId, roomType))) {
      throw new NotInSpace({ spaceId });
    }
  }

  abstract assertAccessible(
    spaceId: string,
    userId: string,
    permission?: Permission
  ): Promise<void>;

  push(spaceId: string, docId: string, updates: Buffer[], editorId: string) {
    this.assertIn(spaceId);
    return this.storage.pushDocUpdates(spaceId, docId, updates, editorId);
  }

  get(spaceId: string, docId: string) {
    this.assertIn(spaceId);
    return this.storage.getDoc(spaceId, docId);
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
    private readonly permission: PermissionService
  ) {
    super(SpaceType.Workspace, client, storage);
  }

  override push(
    spaceId: string,
    docId: string,
    updates: Buffer[],
    editorId: string
  ) {
    const id = new DocID(docId, spaceId);
    return super.push(spaceId, id.guid, updates, editorId);
  }

  override get(spaceId: string, docId: string) {
    const id = new DocID(docId, spaceId);
    return this.storage.getDoc(spaceId, id.guid);
  }

  async assertAccessible(
    spaceId: string,
    userId: string,
    permission: Permission = Permission.Read
  ) {
    if (
      !(await this.permission.isWorkspaceMember(spaceId, userId, permission))
    ) {
      throw new SpaceAccessDenied({ spaceId });
    }
  }
}

class UserspaceSyncAdapter extends SyncSocketAdapter {
  constructor(client: Socket, storage: DocStorageAdapter) {
    super(SpaceType.Userspace, client, storage);
  }

  async assertAccessible(
    spaceId: string,
    userId: string,
    _permission: Permission = Permission.Read
  ) {
    if (spaceId !== userId) {
      throw new SpaceAccessDenied({ spaceId });
    }
  }
}
