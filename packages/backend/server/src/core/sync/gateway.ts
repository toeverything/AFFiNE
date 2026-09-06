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
  BadRequest,
  CallMetric,
  checkCanaryDateClientVersion,
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
import { authorizeReservedDocSubject } from '../../native';
import { CurrentUser } from '../auth';
import {
  DocReader,
  DocStorageAdapter,
  PgUserspaceDocStorageAdapter,
  PgWorkspaceDocStorageAdapter,
} from '../doc';
import { applyUpdatesWithNative } from '../doc/merge-updates';
import {
  type DocAction,
  PermissionAccess,
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
// sync-026: legacy doc sync protocol (space:broadcast-doc-updates).
// sync-027: batch doc sync protocol (invalidation + active subscriptions).
type RoomType = 'sync' | 'sync-026' | 'sync-027' | `${string}:awareness`;

function Room(
  spaceId: string,
  type: RoomType = 'sync'
): `${string}:${RoomType}` {
  return `${spaceId}:${type}`;
}

const MIN_WS_CLIENT_VERSION = new semver.Range('>=0.26.0', {
  includePrerelease: true,
});
const MIN_BATCH_WS_CLIENT_VERSION = new semver.Range('>=0.27.5-0', {
  includePrerelease: true,
});
const MAX_SPACE_JOIN_BATCH_SIZE = 100;

const SOCKET_PRESENCE_USER_ID_KEY = 'affinePresenceUserId';

function normalizeWsClientVersion(clientVersion: string): string | null {
  const canaryCheck = checkCanaryDateClientVersion(clientVersion);
  if (!canaryCheck.matched) {
    return clientVersion;
  }

  if (!env.namespaces.canary) {
    return null;
  }

  return canaryCheck.allowed ? canaryCheck.normalized : null;
}

function isSupportedWsClientVersion(clientVersion: string): boolean {
  const normalized = normalizeWsClientVersion(clientVersion);
  if (!normalized) {
    return false;
  }

  return Boolean(
    semver.valid(normalized) && MIN_WS_CLIENT_VERSION.test(normalized)
  );
}

function isBatchWsClientVersion(clientVersion: string): boolean {
  const normalized = normalizeWsClientVersion(clientVersion);
  return Boolean(normalized && MIN_BATCH_WS_CLIENT_VERSION.test(normalized));
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

interface JoinSpaceBatchEntry {
  spaceType: SpaceType;
  spaceId: string;
  docId?: string;
}

interface JoinSpaceBatchMessage {
  spaces: [JoinSpaceBatchEntry, ...JoinSpaceBatchEntry[]];
  clientVersion: string;
}

interface LeaveSpaceMessage {
  spaceType: SpaceType;
  spaceId: string;
}

interface LeaveSpaceBatchMessage extends LeaveSpaceMessage {
  docIds: string[];
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

interface SyncAwarenessEvent {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  sourceSocketId?: string;
}

interface SyncDocUpdatesPayload {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  updates: Uint8Array[];
  timestamp: number;
  editor?: string;
}

declare global {
  interface Events {
    'sync.doc.updates.pushed': {
      spaceType: SpaceType;
      spaceId: string;
      docId: string;
      updates: string[];
      timestamp: number;
      editor?: string;
    };
    'sync.awareness.collect': SyncAwarenessEvent;
    'sync.awareness.updated': SyncAwarenessEvent & {
      awarenessUpdate: string;
    };
    'sync.permissions.changed': {
      spaceType: SpaceType;
      spaceId: string;
      docId?: string;
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJoinSpaceBatchMessage(message: unknown): JoinSpaceBatchMessage {
  if (!isRecord(message)) {
    throw new BadRequest('Invalid space join batch payload.');
  }

  const { spaces, clientVersion } = message;
  if (!Array.isArray(spaces) || spaces.length === 0) {
    throw new BadRequest('Space join batch must not be empty.');
  }
  if (spaces.length > MAX_SPACE_JOIN_BATCH_SIZE) {
    throw new BadRequest(
      `Space join batch exceeds limit (${MAX_SPACE_JOIN_BATCH_SIZE}).`
    );
  }
  if (typeof clientVersion !== 'string' || clientVersion.length === 0) {
    throw new BadRequest('Space join batch requires a client version.');
  }

  const entries = spaces.map((space, index) => {
    if (!isRecord(space)) {
      throw new BadRequest(`Invalid space join batch entry at index ${index}.`);
    }

    const { spaceType, spaceId, docId } = space;
    if (
      (spaceType !== SpaceType.Userspace &&
        spaceType !== SpaceType.Workspace) ||
      typeof spaceId !== 'string' ||
      spaceId.trim().length === 0 ||
      (docId !== undefined &&
        (typeof docId !== 'string' || docId.trim().length === 0))
    ) {
      throw new BadRequest(`Invalid space join batch entry at index ${index}.`);
    }

    return {
      spaceType,
      spaceId,
      ...(docId === undefined ? {} : { docId }),
    } satisfies JoinSpaceBatchEntry;
  }) as [JoinSpaceBatchEntry, ...JoinSpaceBatchEntry[]];

  const first = entries[0];
  const duplicateKeys = new Set<string>();
  for (const entry of entries) {
    if (
      entry.spaceType !== first.spaceType ||
      entry.spaceId !== first.spaceId
    ) {
      throw new BadRequest(
        'Space join batch entries must belong to one space.'
      );
    }

    const key = JSON.stringify([
      entry.spaceType,
      entry.spaceId,
      entry.docId ?? null,
    ]);
    if (duplicateKeys.has(key)) {
      throw new BadRequest('Space join batch contains duplicate entries.');
    }
    duplicateKeys.add(key);
  }

  return { spaces: entries, clientVersion };
}

function parseLeaveSpaceBatchMessage(message: unknown): LeaveSpaceBatchMessage {
  if (!isRecord(message)) {
    throw new BadRequest('Invalid space leave batch payload.');
  }

  const { spaceType, spaceId, docIds } = message;
  if (
    (spaceType !== SpaceType.Userspace && spaceType !== SpaceType.Workspace) ||
    typeof spaceId !== 'string' ||
    spaceId.trim().length === 0 ||
    !Array.isArray(docIds) ||
    docIds.some(docId => typeof docId !== 'string' || docId.trim().length === 0)
  ) {
    throw new BadRequest('Invalid space leave batch payload.');
  }

  return { spaceType, spaceId, docIds };
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
  private readonly activeDocSockets = new Map<string, Set<Socket>>();
  private readonly activeSocketDocs = new Map<string, Set<string>>();

  constructor(
    private readonly ac: PermissionAccess,
    private readonly workspace: PgWorkspaceDocStorageAdapter,
    private readonly userspace: PgUserspaceDocStorageAdapter,
    private readonly docReader: DocReader,
    private readonly models: Models,
    private readonly event: EventBus
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

  private assertReservedDocSubject(
    spaceType: SpaceType,
    userId: string,
    workspaceId: string,
    docId: string
  ) {
    if (
      spaceType === SpaceType.Workspace &&
      !authorizeReservedDocSubject(userId, workspaceId, docId)
    ) {
      throw new SpaceAccessDenied({ spaceId: workspaceId });
    }
  }

  private activeDocKey(spaceType: SpaceType, spaceId: string, docId: string) {
    return `${spaceType}:${spaceId}:${docId}`;
  }

  private addActiveDocSubscription(
    client: Socket,
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ) {
    const key = this.activeDocKey(spaceType, spaceId, docId);
    let sockets = this.activeDocSockets.get(key);
    if (!sockets) {
      sockets = new Set();
      this.activeDocSockets.set(key, sockets);
    }
    sockets.add(client);

    let docs = this.activeSocketDocs.get(client.id);
    if (!docs) {
      docs = new Set();
      this.activeSocketDocs.set(client.id, docs);
    }
    docs.add(key);
  }

  private removeActiveDocSubscription(
    client: Socket,
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ) {
    const key = this.activeDocKey(spaceType, spaceId, docId);
    const sockets = this.activeDocSockets.get(key);
    sockets?.delete(client);
    if (sockets && sockets.size === 0) {
      this.activeDocSockets.delete(key);
    }

    const docs = this.activeSocketDocs.get(client.id);
    docs?.delete(key);
    if (docs && docs.size === 0) {
      this.activeSocketDocs.delete(client.id);
    }
  }

  private removeAllActiveDocSubscriptions(client: Socket) {
    const docs = this.activeSocketDocs.get(client.id);
    if (!docs) {
      return;
    }

    for (const key of docs) {
      const sockets = this.activeDocSockets.get(key);
      sockets?.delete(client);
      if (sockets && sockets.size === 0) {
        this.activeDocSockets.delete(key);
      }
    }
    this.activeSocketDocs.delete(client.id);
  }

  private removeActiveDocSubscriptionsInSpace(
    client: Socket,
    spaceType: SpaceType,
    spaceId: string
  ) {
    const prefix = `${spaceType}:${spaceId}:`;
    for (const key of Array.from(this.activeSocketDocs.get(client.id) ?? [])) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const [, keySpaceId, docId] = key.split(':');
      this.removeActiveDocSubscription(client, spaceType, keySpaceId, docId);
    }
  }

  private hasActiveDocSubscription(
    client: Socket,
    spaceType: SpaceType,
    spaceId: string,
    docId: string
  ) {
    return Boolean(
      this.activeSocketDocs
        .get(client.id)
        ?.has(this.activeDocKey(spaceType, spaceId, docId))
    );
  }

  private emitActiveDocUpdate(
    payload: SyncDocUpdatesPayload,
    sourceSocketId?: string,
    broadcastPayload?: BroadcastDocUpdatesMessage
  ) {
    const sockets = this.activeDocSockets.get(
      this.activeDocKey(payload.spaceType, payload.spaceId, payload.docId)
    );
    if (!sockets) {
      return;
    }

    const activeBroadcastPayload =
      broadcastPayload ??
      this.buildBroadcastPayload(
        payload.spaceType,
        payload.spaceId,
        payload.docId,
        payload.updates,
        payload.timestamp,
        payload.editor
      );
    for (const socket of sockets) {
      if (socket.id !== sourceSocketId) {
        socket.emit('space:broadcast-doc-updates', activeBroadcastPayload);
      }
    }
  }

  private emitActiveAwarenessCollect(event: SyncAwarenessEvent) {
    const sockets = this.activeDocSockets.get(
      this.activeDocKey(event.spaceType, event.spaceId, event.docId)
    );
    if (!sockets) {
      return;
    }

    for (const socket of sockets) {
      if (socket.id !== event.sourceSocketId) {
        socket.emit('space:collect-awareness', {
          spaceType: event.spaceType,
          spaceId: event.spaceId,
          docId: event.docId,
        });
      }
    }
  }

  private emitActiveAwarenessUpdate(
    event: SyncAwarenessEvent & { awarenessUpdate: string }
  ) {
    const sockets = this.activeDocSockets.get(
      this.activeDocKey(event.spaceType, event.spaceId, event.docId)
    );
    if (!sockets) {
      return;
    }

    for (const socket of sockets) {
      if (socket.id !== event.sourceSocketId) {
        socket.emit('space:broadcast-awareness-update', {
          spaceType: event.spaceType,
          spaceId: event.spaceId,
          docId: event.docId,
          awarenessUpdate: event.awarenessUpdate,
        });
      }
    }
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
    this.removeAllActiveDocSubscriptions(client);
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
    const userId = request.session?.user.id;
    if (typeof userId !== 'string' || !userId) {
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
    this.publishDocUpdate({
      spaceType: spaceType as SpaceType,
      spaceId,
      docId,
      updates,
      timestamp,
      editor,
    });
  }

  @OnEvent('sync.doc.updates.pushed')
  onClusterDocUpdatesPushed(payload: Events['sync.doc.updates.pushed']) {
    this.emitActiveDocUpdate({
      ...payload,
      updates: payload.updates.map(update =>
        Uint8Array.from(Buffer.from(update, 'base64'))
      ),
    });
  }

  @OnEvent('sync.awareness.collect')
  onClusterAwarenessCollect(event: Events['sync.awareness.collect']) {
    this.emitActiveAwarenessCollect(event);
  }

  @OnEvent('sync.awareness.updated')
  onClusterAwarenessUpdated(event: Events['sync.awareness.updated']) {
    this.emitActiveAwarenessUpdate(event);
  }

  @OnEvent('doc.grants.changed')
  @OnEvent('doc.owner.changed')
  @OnEvent('doc.default_role.changed')
  @OnEvent('doc.public_state.changed')
  @OnEvent('workspace.members.updated')
  @OnEvent('workspace.members.roleChanged')
  @OnEvent('workspace.members.removed')
  @OnEvent('workspace.members.leave')
  @OnEvent('workspace.owner.changed')
  async onPermissionChanged({
    workspaceId,
    docId,
  }: {
    workspaceId: string;
    docId?: string;
  }) {
    await this.publishPermissionChange({
      spaceType: SpaceType.Workspace,
      spaceId: workspaceId,
      docId,
    });
  }

  @OnEvent('sync.permissions.changed')
  async onClusterPermissionsChanged(event: Events['sync.permissions.changed']) {
    await this.revalidateActiveDocSubscriptions(event);
  }

  private async publishPermissionChange(
    event: Events['sync.permissions.changed']
  ) {
    await this.revalidateActiveDocSubscriptions(event);
    this.event.broadcast('sync.permissions.changed', event);
  }

  private async revalidateActiveDocSubscriptions(
    event: Events['sync.permissions.changed']
  ) {
    const spacePrefix = `${event.spaceType}:${event.spaceId}:`;
    const exactKey = event.docId
      ? this.activeDocKey(event.spaceType, event.spaceId, event.docId)
      : undefined;
    const candidates = [...this.activeDocSockets.entries()].filter(
      ([key]) => key === exactKey || (!exactKey && key.startsWith(spacePrefix))
    );

    for (const [key, sockets] of candidates) {
      const [, spaceId, docId] = key.split(':');
      for (const socket of Array.from(sockets)) {
        const userId = this.resolvePresenceUserId(socket);
        if (!userId) {
          this.removeActiveDocSubscription(
            socket,
            event.spaceType,
            spaceId,
            docId
          );
          continue;
        }

        try {
          this.assertReservedDocSubject(
            event.spaceType,
            userId,
            spaceId,
            docId
          );
          await this.assertDocActionAllowed(
            event.spaceType,
            userId,
            spaceId,
            docId,
            'Doc.Read'
          );
        } catch {
          this.removeActiveDocSubscription(
            socket,
            event.spaceType,
            spaceId,
            docId
          );
        }
      }
    }
  }

  private publishDocUpdate(
    payload: SyncDocUpdatesPayload,
    sourceSocket?: Socket
  ) {
    if (!this.server || payload.updates.length === 0) {
      return;
    }

    const legacyRoom = `${payload.spaceType}:${Room(
      payload.spaceId,
      'sync-026'
    )}`;
    const broadcastPayload = this.buildBroadcastPayload(
      payload.spaceType,
      payload.spaceId,
      payload.docId,
      payload.updates,
      payload.timestamp,
      payload.editor
    );
    if (sourceSocket) {
      sourceSocket
        .to(legacyRoom)
        .emit('space:broadcast-doc-updates', broadcastPayload);
    } else {
      this.server
        .to(legacyRoom)
        .emit('space:broadcast-doc-updates', broadcastPayload);
    }

    const batchRoom = `${payload.spaceType}:${Room(
      payload.spaceId,
      'sync-027'
    )}`;
    const invalidation = {
      spaceType: payload.spaceType,
      spaceId: payload.spaceId,
      timestamp: payload.timestamp,
    };
    if (sourceSocket) {
      sourceSocket
        .to(batchRoom)
        .emit('space:broadcast-doc-invalidation', invalidation);
    } else {
      this.server
        .to(batchRoom)
        .emit('space:broadcast-doc-invalidation', invalidation);
    }

    this.emitActiveDocUpdate(payload, sourceSocket?.id, broadcastPayload);
    metrics.socketio
      .counter('doc_updates_broadcast')
      .add(broadcastPayload.updates.length, {
        mode: broadcastPayload.compressed ? 'compressed' : 'batch',
      });
    this.event.broadcast('sync.doc.updates.pushed', {
      ...payload,
      updates: this.encodeUpdates(payload.updates),
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
    if (![SpaceType.Userspace, SpaceType.Workspace].includes(spaceType)) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

    if (!isSupportedWsClientVersion(clientVersion)) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }
    if (isBatchWsClientVersion(clientVersion)) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

    const adapter = this.selectAdapter(client, spaceType);
    await adapter.join(user.id, spaceId);
    this.removeActiveDocSubscriptionsInSpace(client, spaceType, spaceId);

    const legacyRoom = adapter.room(spaceId, 'sync-026');
    const batchRoom = adapter.room(spaceId, 'sync-027');
    if (client.rooms.has(batchRoom)) {
      await client.leave(batchRoom);
    }
    if (!client.rooms.has(legacyRoom)) {
      await client.join(legacyRoom);
    }

    return { data: { clientId: client.id, success: true } };
  }

  @SubscribeMessage('space:join-batch')
  async onJoinSpaceBatch(
    @CurrentUser() user: CurrentUser,
    @ConnectedSocket() client: Socket,
    @MessageBody() message: unknown
  ): Promise<EventResponse<{ clientId: string; success: boolean }>> {
    const { spaces, clientVersion } = parseJoinSpaceBatchMessage(message);
    if (
      !isSupportedWsClientVersion(clientVersion) ||
      !isBatchWsClientVersion(clientVersion)
    ) {
      this.rejectJoin(client);
      return { data: { clientId: client.id, success: false } };
    }

    const [first] = spaces;
    const adapter = this.selectAdapter(client, first.spaceType);

    // Authorize the whole batch before mutating any Socket.IO room. This is
    // intentionally separate from SyncSocketAdapter.join(), which is also
    // used by the legacy single-room handlers.
    await adapter.assertAccessible(first.spaceId, user.id, 'Workspace.Sync');

    for (const space of spaces) {
      if (space.docId === undefined) {
        continue;
      }
      this.assertReservedDocSubject(
        space.spaceType,
        user.id,
        space.spaceId,
        space.docId
      );
      await this.assertDocActionAllowed(
        space.spaceType,
        user.id,
        space.spaceId,
        space.docId,
        'Doc.Read'
      );
    }

    const rooms = new Set<string>();
    rooms.add(adapter.room(first.spaceId));
    rooms.add(adapter.room(first.spaceId, 'sync-027'));
    const legacyRoom = adapter.room(first.spaceId, 'sync-026');

    const roomsToJoin = [...rooms].filter(room => !client.rooms.has(room));
    const subscriptionsToAdd = spaces.filter(
      (space): space is JoinSpaceBatchEntry & { docId: string } =>
        space.docId !== undefined &&
        !this.hasActiveDocSubscription(
          client,
          space.spaceType,
          space.spaceId,
          space.docId
        )
    );
    try {
      if (roomsToJoin.length > 0) {
        await client.join(roomsToJoin);
      }
      for (const space of subscriptionsToAdd) {
        this.addActiveDocSubscription(
          client,
          space.spaceType,
          space.spaceId,
          space.docId
        );
      }
      if (client.rooms.has(legacyRoom)) {
        await client.leave(legacyRoom);
      }
    } catch (error) {
      for (const space of subscriptionsToAdd) {
        this.removeActiveDocSubscription(
          client,
          space.spaceType,
          space.spaceId,
          space.docId
        );
      }
      await Promise.all(
        roomsToJoin
          .filter(room => client.rooms.has(room))
          .map(async room => {
            await client.leave(room);
          })
      );
      throw error;
    }

    return { data: { clientId: client.id, success: true } };
  }

  @SubscribeMessage('space:leave-batch')
  async onLeaveSpaceBatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: unknown
  ): Promise<EventResponse<{ clientId: string; success: true }>> {
    const { spaceType, spaceId, docIds } = parseLeaveSpaceBatchMessage(message);
    for (const docId of docIds) {
      this.removeActiveDocSubscription(client, spaceType, spaceId, docId);
    }

    const activeDocs = this.activeSocketDocs.get(client.id);
    const hasActiveDocsInSpace = Array.from(activeDocs ?? []).some(key =>
      key.startsWith(`${spaceType}:${spaceId}:`)
    );
    if (docIds.length === 0 && !hasActiveDocsInSpace) {
      const adapter = this.selectAdapter(client, spaceType);
      await adapter.leave(spaceId, 'sync-027');
      await adapter.leave(spaceId);
    }

    return { data: { clientId: client.id, success: true } };
  }

  @SubscribeMessage('space:leave')
  async onLeaveSpace(
    @ConnectedSocket() client: Socket,
    @MessageBody() { spaceType, spaceId }: LeaveSpaceMessage
  ): Promise<EventResponse<{ clientId: string; success: true }>> {
    const adapter = this.selectAdapter(client, spaceType);
    this.removeActiveDocSubscriptionsInSpace(client, spaceType, spaceId);
    await adapter.leave(spaceId);
    await adapter.leave(spaceId, 'sync-026');
    await adapter.leave(spaceId, 'sync-027');

    return { data: { clientId: client.id, success: true } };
  }

  @SubscribeMessage('space:load-doc')
  async onLoadSpaceDoc(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser,
    @MessageBody()
    { spaceType, spaceId, docId, stateVector }: LoadDocMessage
  ): Promise<
    EventResponse<{ missing: string; state: string; timestamp: number }>
  > {
    const id = new DocID(docId, spaceId);
    const adapter = this.selectAdapter(client, spaceType);
    adapter.assertIn(spaceId);
    this.assertReservedDocSubject(spaceType, user.id, spaceId, id.guid);
    await this.assertDocActionAllowed(
      spaceType,
      user.id,
      spaceId,
      id.guid,
      'Doc.Read'
    );

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
    @CurrentUser() user: CurrentUser,
    @MessageBody() { spaceType, spaceId, docId }: DeleteDocMessage
  ): Promise<EventResponse<{ success: true }>> {
    const adapter = this.selectAdapter(client, spaceType);
    this.assertReservedDocSubject(spaceType, user.id, spaceId, docId);
    await this.assertDocActionAllowed(
      spaceType,
      user.id,
      spaceId,
      docId,
      'Doc.Delete'
    );
    await adapter.delete(spaceId, docId);
    return { data: { success: true } };
  }

  /**
   * client should always merge updates on their own
   */
  @SubscribeMessage('space:push-doc-update')
  async onReceiveDocUpdate(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser,
    @MessageBody()
    message: PushDocUpdateMessage
  ): Promise<EventResponse<{ accepted: true; timestamp?: number }>> {
    const { spaceType, spaceId, docId, update } = message;
    const adapter = this.selectAdapter(client, spaceType);

    // Quota recovery mode is intentionally not applied to sync.
    this.assertReservedDocSubject(spaceType, user.id, spaceId, docId);
    await this.assertDocActionAllowed(
      spaceType,
      user.id,
      spaceId,
      docId,
      'Doc.Update'
    );
    const timestamp = await adapter.push(
      spaceId,
      docId,
      [Buffer.from(update, 'base64')],
      user.id
    );

    this.publishDocUpdate(
      {
        spaceType,
        spaceId,
        docId,
        updates: [Buffer.from(update, 'base64')],
        timestamp,
        editor: user.id,
      },
      client
    );

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
    @CurrentUser() user: CurrentUser,
    @MessageBody()
    { spaceType, spaceId, timestamp }: LoadDocTimestampsMessage
  ): Promise<EventResponse<Record<string, number>>> {
    const adapter = this.selectAdapter(client, spaceType);

    const stats = await adapter.getTimestamps(spaceId, timestamp);
    if (!stats || spaceType === SpaceType.Userspace) {
      return {
        data: stats ?? {},
      };
    }

    const readableDocs = await this.ac
      .user(user.id)
      .workspace(spaceId)
      .docs(
        Object.keys(stats).map(docId => ({ docId })),
        'Doc.Read'
      );
    const readableDocIds = new Set(readableDocs.map(doc => doc.docId));

    return {
      data: Object.fromEntries(
        Object.entries(stats).filter(([docId]) => readableDocIds.has(docId))
      ),
    };
  }

  @SubscribeMessage('space:join-awareness')
  async onJoinAwareness(
    @ConnectedSocket() client: Socket,
    @CurrentUser() user: CurrentUser,
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
    if (isBatchWsClientVersion(clientVersion)) {
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

    if (this.hasActiveDocSubscription(client, spaceType, spaceId, docId)) {
      adapter.assertIn(spaceId);
      const event = { spaceType, spaceId, docId, sourceSocketId: client.id };
      this.emitActiveAwarenessCollect(event);
      this.event.broadcast('sync.awareness.collect', event);
    } else {
      const roomType = `${docId}:awareness` as const;
      adapter.assertIn(spaceId, roomType);
      client
        .to(adapter.room(spaceId, roomType))
        .emit('space:collect-awareness', { spaceType, spaceId, docId });
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

    if (this.hasActiveDocSubscription(client, spaceType, spaceId, docId)) {
      adapter.assertIn(spaceId);
      const event = { ...message, sourceSocketId: client.id };
      this.emitActiveAwarenessUpdate(event);
      this.event.broadcast('sync.awareness.updated', event);
    } else {
      const roomType = `${docId}:awareness` as const;
      adapter.assertIn(spaceId, roomType);
      client
        .to(adapter.room(spaceId, roomType))
        .emit('space:broadcast-awareness-update', message);
    }

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
    private readonly ac: PermissionAccess,
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
