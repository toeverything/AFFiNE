import { createHash } from 'node:crypto';

import {
  applyDecorators,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UseInterceptors,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage as RawSubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Request } from 'express';
import { ClsInterceptor } from 'nestjs-cls';
import semver from 'semver';
import { type Server, Socket } from 'socket.io';

import {
  CallMetric,
  checkCanaryDateClientVersion,
  DocActionDenied,
  DocNotFound,
  DocUpdateBlocked,
  EventBus,
  GatewayErrorWrapper,
  metrics,
  NotInSpace,
  OnEvent,
  SpaceAccessDenied,
  testComparableClientVersion,
} from '../../base';
import { Models } from '../../models';
import {
  AnonymousDocAccessService,
  type AnonymousDocGuestPrincipal,
} from '../anonymous-doc-access';
import { CurrentUser } from '../auth';
import {
  DocReader,
  DocStorageAdapter,
  PgUserspaceDocStorageAdapter,
  PgWorkspaceDocStorageAdapter,
} from '../doc';
import { applyUpdatesWithNative } from '../doc/merge-updates';
import {
  AccessController,
  type DocAction,
  WorkspaceAction,
} from '../permission';
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

// sync: shared room for space membership checks and non-protocol broadcasts.
// sync-025: legacy 0.25 doc sync protocol (space:broadcast-doc-update).
// sync-026: current doc sync protocol (space:broadcast-doc-updates).
type RoomType = 'sync' | 'sync-025' | 'sync-026' | `${string}:awareness`;

function Room(
  spaceId: string,
  type: RoomType = 'sync'
): `${string}:${RoomType}` {
  return `${spaceId}:${type}`;
}

const MIN_WS_CLIENT_VERSION = new semver.Range('>=0.25.0', {
  includePrerelease: true,
});
const DOC_UPDATES_PROTOCOL_026 = new semver.Range('>=0.26.0-0', {
  includePrerelease: true,
});

type SyncProtocolRoomType = Extract<RoomType, 'sync-025' | 'sync-026'>;
const SOCKET_PRESENCE_USER_ID_KEY = 'affinePresenceUserId';
const ANONYMOUS_GUEST_TOKEN_KEY = 'anonymousGuestToken';

function normalizeWsClientVersion(clientVersion: string): string | null {
  if (env.namespaces.canary) {
    const canaryCheck = checkCanaryDateClientVersion(clientVersion);
    if (canaryCheck.matched) {
      return canaryCheck.allowed ? canaryCheck.normalized : null;
    }
  }

  return clientVersion;
}

function isSupportedWsClientVersion(clientVersion: string): boolean {
  const normalized = normalizeWsClientVersion(clientVersion);
  if (!normalized) {
    return false;
  }

  return testComparableClientVersion(MIN_WS_CLIENT_VERSION, normalized);
}

function getSyncProtocolRoomType(clientVersion: string): SyncProtocolRoomType {
  const normalized = normalizeWsClientVersion(clientVersion);
  return testComparableClientVersion(
    DOC_UPDATES_PROTOCOL_026,
    normalized ?? clientVersion
  )
    ? 'sync-026'
    : 'sync-025';
}

enum SpaceType {
  Workspace = 'workspace',
  Userspace = 'userspace',
}

interface JoinSpaceMessage {
  spaceType: SpaceType;
  spaceId: string;
  clientVersion: string;
  docId?: string;
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

interface PushDocUpdateMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  update: string;
}

interface BroadcastDocUpdatesMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  updates: string[];
  timestamp: number;
  editor?: string;
  compressed?: boolean;
}

interface BroadcastDocUpdateMessage {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  update: string;
  timestamp: number;
  editor: string;
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
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  protected logger = new Logger(SpaceSyncGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  private connectionCount = 0;
  private readonly socketUsers = new Map<string, string>();
  private readonly localUserConnectionCounts = new Map<string, number>();
  private unresolvedPresenceSockets = 0;
  private flushTimer?: NodeJS.Timeout;
  private activeUsersFlushTimer?: NodeJS.Timeout;
  private activeUsersFlushInFlight = false;
  private activeUsersFlushQueued = false;

  constructor(
    private readonly ac: AccessController,
    private readonly event: EventBus,
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly userspace: PgUserspaceDocStorageAdapter,
    private readonly docReader: DocReader,
    private readonly models: Models,
    private readonly anonymous: AnonymousDocAccessService
  ) {}

  onModuleInit() {
    this.scheduleActiveUsersFlush(0);
    this.flushTimer = setInterval(() => {
      this.scheduleActiveUsersFlush(0);
    }, 60_000);
    this.flushTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.activeUsersFlushTimer) {
      clearTimeout(this.activeUsersFlushTimer);
      this.activeUsersFlushTimer = undefined;
    }
    this.activeUsersFlushQueued = false;
  }

  private encodeUpdates(updates: Uint8Array[]) {
    return updates.map(update => Buffer.from(update).toString('base64'));
  }

  private buildBroadcastPayload(
    spaceType: SpaceType,
    spaceId: string,
    docId: string,
    updates: Uint8Array[],
    timestamp: number,
    editor?: string
  ): BroadcastDocUpdatesMessage {
    const encodedUpdates = this.encodeUpdates(updates);
    if (updates.length <= 1) {
      return {
        spaceType,
        spaceId,
        docId,
        updates: encodedUpdates,
        timestamp,
        editor,
        compressed: false,
      };
    }

    try {
      const merged = applyUpdatesWithNative(
        updates,
        'socketio.broadcast',
        this.logger
      );
      metrics.socketio.counter('doc_updates_compressed').add(1);
      return {
        spaceType,
        spaceId,
        docId,
        updates: [Buffer.from(merged).toString('base64')],
        timestamp,
        editor,
        compressed: true,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to merge updates for broadcast, falling back to batch: ${this.formatError(error)}`
      );
      return {
        spaceType,
        spaceId,
        docId,
        updates: encodedUpdates,
        timestamp,
        editor,
        compressed: false,
      };
    }
  }

  private rejectJoin(client: Socket) {
    // Give socket.io a chance to flush the ack packet before disconnecting.
    setImmediate(() => client.disconnect());
  }

  private getAnonymousGuestToken(client: Socket): string | null {
    const token = client.handshake.auth?.[ANONYMOUS_GUEST_TOKEN_KEY];
    return typeof token === 'string' && token ? token : null;
  }

  private async getAnonymousPrincipal(
    client: Socket
  ): Promise<AnonymousDocGuestPrincipal | null> {
    const token = this.getAnonymousGuestToken(client);
    if (!token) {
      return null;
    }

    return await this.anonymous.getGuestPrincipal(token);
  }

  private anonymousDocRoom(
    spaceId: string,
    docId: string,
    protocolRoomType: SyncProtocolRoomType
  ) {
    return `${SpaceType.Workspace}:${spaceId}:anonymous-doc:${docId}:${protocolRoomType}`;
  }

  private anonymousAwarenessRoom(spaceId: string, docId: string) {
    return `${SpaceType.Workspace}:${spaceId}:anonymous-doc:${docId}:awareness`;
  }

  private broadcastAnonymousDocRooms(
    spaceId: string,
    docId: string,
    updates: Uint8Array[],
    timestamp: number,
    editor?: string
  ) {
    const encodedUpdates = this.encodeUpdates(updates);
    for (const update of encodedUpdates) {
      this.server
        .to(this.anonymousDocRoom(spaceId, docId, 'sync-025'))
        .emit('space:broadcast-doc-update', {
          spaceType: SpaceType.Workspace,
          spaceId,
          docId,
          update,
          timestamp,
          editor: editor ?? '',
        } satisfies BroadcastDocUpdateMessage);
    }

    const payload = this.buildBroadcastPayload(
      SpaceType.Workspace,
      spaceId,
      docId,
      updates,
      timestamp,
      editor
    );
    this.server
      .to(this.anonymousDocRoom(spaceId, docId, 'sync-026'))
      .emit('space:broadcast-doc-updates', payload);
  }

  private async assertDocActionAllowed(
    spaceType: SpaceType,
    userId: string,
    spaceId: string,
    docId: string,
    action: DocAction
  ) {
    if (spaceType === SpaceType.Userspace) {
      if (spaceId !== userId) {
        throw new SpaceAccessDenied({ spaceId });
      }
      return;
    }

    await this.ac.user(userId).doc(spaceId, docId).assert(action);
  }

  handleConnection(client: Socket) {
    this.connectionCount++;
    this.logger.debug(`New connection, total: ${this.connectionCount}`);
    metrics.socketio.gauge('connections').record(this.connectionCount);
    const userId = this.attachPresenceUserId(client);
    this.trackConnectedSocket(client.id, userId);
    this.scheduleActiveUsersFlush();
  }

  handleDisconnect(client: Socket) {
    this.connectionCount = Math.max(0, this.connectionCount - 1);
    this.trackDisconnectedSocket(client.id);
    this.logger.debug(
      `Connection disconnected, total: ${this.connectionCount}`
    );
    metrics.socketio.gauge('connections').record(this.connectionCount);
    this.scheduleActiveUsersFlush();
  }

  private attachPresenceUserId(client: Socket): string | null {
    const request = client.request as Request;
    const userId = request.session?.user.id ?? request.token?.user.id;
    if (typeof userId !== 'string' || !userId) {
      const anonymousGuestToken = this.getAnonymousGuestToken(client);
      if (anonymousGuestToken) {
        const anonymousPresenceId = `anonymous:${createHash('sha256')
          .update(anonymousGuestToken)
          .digest('hex')
          .slice(0, 16)}`;
        client.data[SOCKET_PRESENCE_USER_ID_KEY] = anonymousPresenceId;
        return anonymousPresenceId;
      }

      this.logger.warn(
        `Unable to resolve authenticated user id for socket ${client.id}`
      );
      return null;
    }

    client.data[SOCKET_PRESENCE_USER_ID_KEY] = userId;
    return userId;
  }

  private resolvePresenceUserId(socket: { data?: unknown }) {
    if (!socket.data || typeof socket.data !== 'object') {
      return null;
    }

    const userId = (socket.data as Record<string, unknown>)[
      SOCKET_PRESENCE_USER_ID_KEY
    ];
    return typeof userId === 'string' && userId ? userId : null;
  }

  private trackConnectedSocket(socketId: string, userId: string | null) {
    if (!userId) {
      this.unresolvedPresenceSockets++;
      return;
    }

    this.socketUsers.set(socketId, userId);
    const prev = this.localUserConnectionCounts.get(userId) ?? 0;
    this.localUserConnectionCounts.set(userId, prev + 1);
  }

  private trackDisconnectedSocket(socketId: string) {
    const userId = this.socketUsers.get(socketId);
    if (!userId) {
      this.unresolvedPresenceSockets = Math.max(
        0,
        this.unresolvedPresenceSockets - 1
      );
      return;
    }

    this.socketUsers.delete(socketId);
    const next = (this.localUserConnectionCounts.get(userId) ?? 1) - 1;
    if (next <= 0) {
      this.localUserConnectionCounts.delete(userId);
    } else {
      this.localUserConnectionCounts.set(userId, next);
    }
  }

  private resolveLocalActiveUsers() {
    if (this.unresolvedPresenceSockets > 0) {
      return Math.max(0, this.connectionCount);
    }

    return this.localUserConnectionCounts.size;
  }

  private formatError(error: unknown) {
    if (error instanceof Error) {
      return error.stack ?? error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private scheduleActiveUsersFlush(delayMs = 250) {
    if (this.activeUsersFlushTimer) {
      return;
    }

    if (this.activeUsersFlushInFlight) {
      this.activeUsersFlushQueued = true;
      return;
    }

    this.activeUsersFlushTimer = setTimeout(() => {
      this.activeUsersFlushTimer = undefined;
      this.runScheduledActiveUsersFlush();
    }, delayMs);
    this.activeUsersFlushTimer.unref?.();
  }

  private runScheduledActiveUsersFlush() {
    if (this.activeUsersFlushInFlight) {
      this.activeUsersFlushQueued = true;
      return;
    }

    this.activeUsersFlushInFlight = true;
    void this.flushActiveUsersMinute()
      .catch(error => {
        this.logger.warn(
          `Failed to flush active users minute: ${this.formatError(error)}`
        );
      })
      .finally(() => {
        this.activeUsersFlushInFlight = false;
        if (this.activeUsersFlushQueued) {
          this.activeUsersFlushQueued = false;
          this.scheduleActiveUsersFlush(0);
        }
      });
  }

  private async flushActiveUsersMinute(options?: {
    aggregateAcrossCluster?: boolean;
    skipWriteOnAggregateError?: boolean;
  }) {
    const minute = new Date();
    minute.setSeconds(0, 0);

    const aggregateAcrossCluster = options?.aggregateAcrossCluster ?? true;
    const skipWriteOnAggregateError =
      options?.skipWriteOnAggregateError ?? aggregateAcrossCluster;
    let activeUsers = this.resolveLocalActiveUsers();
    if (aggregateAcrossCluster) {
      try {
        const sockets = await this.server.fetchSockets();
        const uniqueUsers = new Set<string>();
        let missingUserCount = 0;
        for (const socket of sockets) {
          const userId = this.resolvePresenceUserId(socket);
          if (userId) {
            uniqueUsers.add(userId);
          } else {
            missingUserCount++;
          }
        }

        if (missingUserCount > 0) {
          activeUsers = sockets.length;
          this.logger.warn(
            `Unable to resolve user id for ${missingUserCount} active sockets, fallback to connection count`
          );
        } else {
          activeUsers = uniqueUsers.size;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to aggregate active users from sockets: ${this.formatError(error)}`
        );
        if (skipWriteOnAggregateError) return;
      }
    }

    await this.models.workspaceAnalytics.upsertSyncActiveUsersMinute(
      minute,
      activeUsers
    );
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

    const room025 = `${spaceType}:${Room(spaceId, 'sync-025')}`;
    const encodedUpdates = this.encodeUpdates(updates);
    for (const update of encodedUpdates) {
      const payload: BroadcastDocUpdateMessage = {
        spaceType: spaceType as SpaceType,
        spaceId,
        docId,
        update,
        timestamp,
        editor: editor ?? '',
      };
      this.server.to(room025).emit('space:broadcast-doc-update', payload);
    }

    const room026 = `${spaceType}:${Room(spaceId, 'sync-026')}`;
    const payload = this.buildBroadcastPayload(
      spaceType as SpaceType,
      spaceId,
      docId,
      updates,
      timestamp,
      editor
    );
    this.server.to(room026).emit('space:broadcast-doc-updates', payload);
    metrics.socketio
      .counter('doc_updates_broadcast')
      .add(payload.updates.length, {
        mode: payload.compressed ? 'compressed' : 'batch',
      });

    if (spaceType === SpaceType.Workspace) {
      this.broadcastAnonymousDocRooms(
        spaceId,
        docId,
        updates,
        timestamp,
        editor
      );
    }
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
    @CurrentUser() user: CurrentUser | undefined,
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { spaceType, spaceId, clientVersion, docId }: JoinSpaceMessage
  ): Promise<EventResponse<{ clientId: string; success: boolean }>> {
    if (![SpaceType.Userspace, SpaceType.Workspace].includes(spaceType)) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

    if (!isSupportedWsClientVersion(clientVersion)) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

    if (spaceType === SpaceType.Workspace) {
      this.event.emit('workspace.embedding', { workspaceId: spaceId });
    }

    const anonymousPrincipal = await this.getAnonymousPrincipal(client);
    if (anonymousPrincipal) {
      if (
        spaceType !== SpaceType.Workspace ||
        anonymousPrincipal.workspaceId !== spaceId ||
        (anonymousPrincipal.docId !== docId && docId !== spaceId)
      ) {
        this.rejectJoin(client);
        return { data: { clientId: client.id, success: false } };
      }

      const protocolRoomType = getSyncProtocolRoomType(clientVersion);
      const protocolRoom = this.anonymousDocRoom(
        spaceId,
        anonymousPrincipal.docId,
        protocolRoomType
      );
      const otherProtocolRoom = this.anonymousDocRoom(
        spaceId,
        anonymousPrincipal.docId,
        protocolRoomType === 'sync-025' ? 'sync-026' : 'sync-025'
      );
      if (client.rooms.has(otherProtocolRoom)) {
        await client.leave(otherProtocolRoom);
      }
      if (!client.rooms.has(protocolRoom)) {
        await client.join(protocolRoom);
      }

      return { data: { clientId: client.id, success: true } };
    }

    if (!user) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

    const adapter = this.selectAdapter(client, spaceType);
    await adapter.join(user.id, spaceId);

    const protocolRoomType = getSyncProtocolRoomType(clientVersion);
    const protocolRoom = adapter.room(spaceId, protocolRoomType);
    const otherProtocolRoom = adapter.room(
      spaceId,
      protocolRoomType === 'sync-025' ? 'sync-026' : 'sync-025'
    );
    if (client.rooms.has(otherProtocolRoom)) {
      await client.leave(otherProtocolRoom);
    }
    if (!client.rooms.has(protocolRoom)) {
      await client.join(protocolRoom);
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
    const anonymousPrincipal = await this.getAnonymousPrincipal(client);
    if (anonymousPrincipal) {
      if (spaceType !== SpaceType.Workspace) {
        throw new SpaceAccessDenied({ spaceId });
      }
      const doc = await this.anonymous.getDocDiff(
        anonymousPrincipal,
        spaceId,
        docId,
        stateVector ? Buffer.from(stateVector, 'base64') : undefined
      );

      return {
        data: {
          missing: Buffer.from(doc.missing).toString('base64'),
          state: Buffer.from(doc.state).toString('base64'),
          timestamp: doc.timestamp,
        },
      };
    }

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
    @CurrentUser() user: CurrentUser | undefined,
    @MessageBody() { spaceType, spaceId, docId }: DeleteDocMessage
  ) {
    if (await this.getAnonymousPrincipal(client)) {
      throw new DocActionDenied({
        spaceId,
        docId,
        action: 'Doc.Delete',
      });
    }
    if (!user) {
      throw new SpaceAccessDenied({ spaceId });
    }

    const adapter = this.selectAdapter(client, spaceType);
    await this.assertDocActionAllowed(
      spaceType,
      user.id,
      spaceId,
      docId,
      'Doc.Delete'
    );
    await adapter.delete(spaceId, docId);
  }

  /**
   * client should always merge updates on their own
   */
  @SubscribeMessage('space:push-doc-update')
  async onReceiveDocUpdate(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser | undefined,
    @MessageBody()
    message: PushDocUpdateMessage
  ): Promise<EventResponse<{ accepted: true; timestamp?: number }>> {
    const { spaceType, spaceId, docId, update } = message;
    const updateBuffer = Buffer.from(update, 'base64');

    const anonymousPrincipal = await this.getAnonymousPrincipal(client);
    if (anonymousPrincipal) {
      if (spaceType !== SpaceType.Workspace) {
        throw new SpaceAccessDenied({ spaceId });
      }

      if (this.anonymous.isReadOnlySyntheticDoc(spaceId, docId)) {
        return {
          data: {
            accepted: true,
          },
        };
      }

      await this.anonymous.assertCanWriteDoc(
        anonymousPrincipal,
        spaceId,
        docId
      );
      const docMeta = await this.models.doc.getMeta(spaceId, docId, {
        select: {
          blocked: true,
        },
      });
      if (docMeta?.blocked) {
        throw new DocUpdateBlocked({ spaceId, docId });
      }

      const timestamp = await this.workspace.pushDocUpdates(spaceId, docId, [
        updateBuffer,
      ]);
      await this.anonymous.recordUpdates(
        anonymousPrincipal,
        [updateBuffer],
        timestamp
      );

      const payload = this.buildBroadcastPayload(
        spaceType,
        spaceId,
        docId,
        [updateBuffer],
        timestamp,
        anonymousPrincipal.guestId
      );
      client
        .to(`${spaceType}:${Room(spaceId, 'sync-026')}`)
        .emit('space:broadcast-doc-updates', payload);
      client
        .to(this.anonymousDocRoom(spaceId, docId, 'sync-026'))
        .emit('space:broadcast-doc-updates', payload);
      metrics.socketio
        .counter('doc_updates_broadcast')
        .add(payload.updates.length, {
          mode: payload.compressed ? 'compressed' : 'batch',
        });

      const legacyPayload: BroadcastDocUpdateMessage = {
        spaceType,
        spaceId,
        docId,
        update,
        timestamp,
        editor: anonymousPrincipal.guestId,
      };
      client
        .to(`${spaceType}:${Room(spaceId, 'sync-025')}`)
        .emit('space:broadcast-doc-update', legacyPayload);
      client
        .to(this.anonymousDocRoom(spaceId, docId, 'sync-025'))
        .emit('space:broadcast-doc-update', legacyPayload);

      return {
        data: {
          accepted: true,
          timestamp,
        },
      };
    }

    if (!user) {
      throw new SpaceAccessDenied({ spaceId });
    }

    const adapter = this.selectAdapter(client, spaceType);

    // Quota recovery mode is intentionally not applied to sync in this phase.
    // TODO(@forehalo): enable after frontend supporting doc revert
    // await this.ac.user(user.id).doc(spaceId, docId).assert('Doc.Update');
    const timestamp = await adapter.push(
      spaceId,
      docId,
      [updateBuffer],
      user.id
    );

    const payload = this.buildBroadcastPayload(
      spaceType,
      spaceId,
      docId,
      [updateBuffer],
      timestamp,
      user.id
    );
    client
      .to(adapter.room(spaceId, 'sync-026'))
      .emit('space:broadcast-doc-updates', payload);
    metrics.socketio
      .counter('doc_updates_broadcast')
      .add(payload.updates.length, {
        mode: payload.compressed ? 'compressed' : 'batch',
      });

    client
      .to(adapter.room(spaceId, 'sync-025'))
      .emit('space:broadcast-doc-update', {
        spaceType,
        spaceId,
        docId,
        update,
        timestamp,
        editor: user.id,
      } satisfies BroadcastDocUpdateMessage);

    if (spaceType === SpaceType.Workspace) {
      this.broadcastAnonymousDocRooms(
        spaceId,
        docId,
        [updateBuffer],
        timestamp,
        user.id
      );
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
    const anonymousPrincipal = await this.getAnonymousPrincipal(client);
    if (anonymousPrincipal) {
      if (
        spaceType !== SpaceType.Workspace ||
        anonymousPrincipal.workspaceId !== spaceId
      ) {
        throw new SpaceAccessDenied({ spaceId });
      }

      const snapshot = await this.models.doc.getSnapshot(
        spaceId,
        anonymousPrincipal.docId,
        {
          select: {
            updatedAt: true,
          },
        }
      );
      const updatedAt = snapshot?.updatedAt.getTime();
      return {
        data:
          updatedAt && (!timestamp || updatedAt > timestamp)
            ? { [anonymousPrincipal.docId]: updatedAt }
            : {},
      };
    }

    const adapter = this.selectAdapter(client, spaceType);

    const stats = await adapter.getTimestamps(spaceId, timestamp);

    return {
      data: stats ?? {},
    };
  }

  @SubscribeMessage('space:join-awareness')
  async onJoinAwareness(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser | undefined,
    @MessageBody()
    { spaceType, spaceId, docId, clientVersion }: JoinSpaceAwarenessMessage
  ) {
    if (![SpaceType.Userspace, SpaceType.Workspace].includes(spaceType)) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

    if (!isSupportedWsClientVersion(clientVersion)) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

    const anonymousPrincipal = await this.getAnonymousPrincipal(client);
    if (anonymousPrincipal) {
      if (spaceType !== SpaceType.Workspace) {
        this.rejectJoin(client);
        return { data: { clientId: client.id, success: false } };
      }
      this.anonymous.assertCanAccessDoc(anonymousPrincipal, spaceId, docId);
      const room = this.anonymousAwarenessRoom(spaceId, docId);
      if (!client.rooms.has(room)) {
        await client.join(room);
      }

      return { data: { clientId: client.id, success: true } };
    }

    if (!user) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

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
    if (await this.getAnonymousPrincipal(client)) {
      await client.leave(this.anonymousAwarenessRoom(spaceId, docId));
      return { data: { clientId: client.id, success: true } };
    }

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
    const anonymousPrincipal = await this.getAnonymousPrincipal(client);
    if (anonymousPrincipal) {
      this.anonymous.assertCanAccessDoc(anonymousPrincipal, spaceId, docId);
      client
        .to(this.anonymousAwarenessRoom(spaceId, docId))
        .emit('space:collect-awareness', { spaceType, spaceId, docId });

      return { data: { clientId: client.id } };
    }

    const adapter = this.selectAdapter(client, spaceType);

    const roomType = `${docId}:awareness` as const;
    adapter.assertIn(spaceId, roomType);
    client
      .to(adapter.room(spaceId, roomType))
      .emit('space:collect-awareness', { spaceType, spaceId, docId });

    return { data: { clientId: client.id } };
  }

  @SubscribeMessage('space:update-awareness')
  async onUpdateAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: UpdateAwarenessMessage
  ) {
    const { spaceType, spaceId, docId } = message;
    const anonymousPrincipal = await this.getAnonymousPrincipal(client);
    if (anonymousPrincipal) {
      this.anonymous.assertCanAccessDoc(anonymousPrincipal, spaceId, docId);
      client
        .to(this.anonymousAwarenessRoom(spaceId, docId))
        .emit('space:broadcast-awareness-update', message);

      return {};
    }

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
