import type { Socket } from 'socket.io-client';

import {
  type DocClock,
  type DocClocks,
  type DocStorageOptions,
  type DocUpdate,
  SnapshotDocStorageBase,
} from '../../storage';
import { createIdConverter } from '../../utils/id-converter';
import type { SpaceType } from '../../utils/universal-id';
import {
  base64ToUint8Array,
  type ServerEventsMap,
  SocketConnection,
  SPACE_JOIN_BATCH_LIMIT,
  uint8ArrayToBase64,
  WORKSPACE_SYNC_PROTOCOL_VERSION,
} from './socket';

interface CloudDocStorageOptions extends DocStorageOptions {
  serverBaseUrl: string;
  isSelfHosted: boolean;
  type: SpaceType;
  accountId: string;
  localReservedDocIds?: string[];
}

function createWebsocketError(error: { name: string; message: string }) {
  const err = new Error(error.message);
  Object.assign(err, error);
  return err;
}

export class CloudDocStorage extends SnapshotDocStorageBase<CloudDocStorageOptions> {
  static readonly identifier = 'CloudDocStorage';

  get socket() {
    return this.connection.inner.socket;
  }
  get idConverter() {
    return this.connection.idConverter;
  }
  readonly spaceType = this.options.type;
  readonly workspaceStateScope =
    this.options.type === 'workspace'
      ? JSON.stringify([
          this.options.serverBaseUrl,
          this.options.id,
          this.options.accountId,
        ])
      : undefined;

  readonly localReservedDocIds = this.options.localReservedDocIds ?? [];

  private readonly inventoryListeners = new Set<() => void>();

  subscribeWorkspaceStateInvalidation(callback: () => void) {
    this.inventoryListeners.add(callback);
    return () => this.inventoryListeners.delete(callback);
  }

  async getWorkspaceState() {
    const response = await this.socket.emitWithAck(
      'space:load-workspace-state',
      {
        spaceType: this.spaceType,
        spaceId: this.spaceId,
      }
    );
    if ('error' in response) throw createWebsocketError(response.error);
    return {
      docs: response.data.docs.map(doc => ({
        ...doc,
        docId: this.idConverter.oldIdToNewId(doc.docId),
      })),
      clocks: Object.fromEntries(
        Object.entries(response.data.clocks).map(([id, clock]) => [
          this.idConverter.oldIdToNewId(id),
          clock,
        ])
      ),
    };
  }

  onServerUpdates: ServerEventsMap['space:broadcast-doc-updates'] = message => {
    if (
      this.spaceType !== message.spaceType ||
      this.spaceId !== message.spaceId
    ) {
      return;
    }

    const docId = this.idConverter.oldIdToNewId(message.docId);
    this.serverDocTimestamps.set(docId, message.timestamp);
    for (const update of message.updates) {
      this.emit('update', {
        docId,
        bin: base64ToUint8Array(update),
        timestamp: new Date(message.timestamp),
        editor: message.editor,
      });
    }
  };

  onServerInvalidation: ServerEventsMap['space:broadcast-doc-invalidation'] =
    message => {
      if (
        this.spaceType !== message.spaceType ||
        this.spaceId !== message.spaceId
      ) {
        return;
      }

      if (message.inventoryChanged) {
        for (const listener of this.inventoryListeners) listener();
        return;
      }
      this.invalidationPending = true;
      this.scheduleInvalidationRepair();
    };

  private readonly serverDocTimestamps = new Map<string, number>();
  private invalidationTimer?: ReturnType<typeof setTimeout>;
  private invalidationRepair?: Promise<void>;
  private invalidationPending = false;

  private scheduleInvalidationRepair() {
    if (this.invalidationTimer) {
      clearTimeout(this.invalidationTimer);
    }
    this.invalidationTimer = setTimeout(() => {
      this.invalidationTimer = undefined;
      if (this.invalidationRepair) {
        return;
      }
      this.invalidationPending = false;
      this.invalidationRepair = this.repairInvalidatedDocs()
        .catch(error => {
          console.error('failed to repair invalidated docs', error);
        })
        .finally(() => {
          this.invalidationRepair = undefined;
          if (this.invalidationPending) {
            this.scheduleInvalidationRepair();
          }
        });
    }, 50);
  }

  private async repairInvalidatedDocs() {
    const timestamps = await this.getDocTimestamps();
    for (const [docId, timestamp] of Object.entries(timestamps)) {
      const newDocId = this.idConverter.oldIdToNewId(docId);
      const timestampValue = timestamp.getTime();
      const previous = this.serverDocTimestamps.get(newDocId);
      if (previous !== undefined && previous >= timestampValue) {
        continue;
      }
      this.serverDocTimestamps.set(newDocId, timestampValue);
      this.emit('update', {
        docId: newDocId,
        bin: new Uint8Array(),
        timestamp,
      });
    }
  }

  readonly connection = new CloudDocStorageConnection(
    this.options,
    this.onServerUpdates,
    this.onServerInvalidation
  );

  override async getDocSnapshot(docId: string) {
    const response = await this.socket.emitWithAck('space:load-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId: await this.connection.joinDoc(
        this.idConverter.newIdToOldId(docId)
      ),
    });

    if ('error' in response) {
      if (response.error.name === 'DOC_NOT_FOUND') {
        return null;
      }
      // TODO: use [UserFriendlyError]
      throw createWebsocketError(response.error);
    }

    return {
      docId,
      bin: base64ToUint8Array(response.data.missing),
      timestamp: new Date(response.data.timestamp),
    };
  }

  override async getDocDiff(docId: string, state?: Uint8Array) {
    const response = await this.socket.emitWithAck('space:load-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId: await this.connection.joinDoc(
        this.idConverter.newIdToOldId(docId)
      ),
      stateVector: state ? await uint8ArrayToBase64(state) : void 0,
    });

    if ('error' in response) {
      if (response.error.name === 'DOC_NOT_FOUND') {
        return null;
      }
      // TODO: use [UserFriendlyError]
      throw createWebsocketError(response.error);
    }

    return {
      docId,
      missing: base64ToUint8Array(response.data.missing),
      state: base64ToUint8Array(response.data.state),
      timestamp: new Date(response.data.timestamp),
    };
  }

  override async pushDocUpdate(update: DocUpdate) {
    const response = await this.socket.emitWithAck('space:push-doc-update', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId:
        update.intent === 'create'
          ? this.idConverter.newIdToOldId(update.docId)
          : await this.connection.joinDoc(
              this.idConverter.newIdToOldId(update.docId)
            ),
      update: await uint8ArrayToBase64(update.bin),
      intent: update.intent ?? 'update',
    });

    if ('error' in response) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw createWebsocketError(response.error);
    }

    return {
      docId: update.docId,
      timestamp: new Date(response.data.timestamp),
    };
  }

  /**
   * Just a rough implementation, cloud doc storage should not need this method.
   */
  override async getDocTimestamp(docId: string): Promise<DocClock | null> {
    const response = await this.socket.emitWithAck('space:load-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId: await this.connection.joinDoc(
        this.idConverter.newIdToOldId(docId)
      ),
    });

    if ('error' in response) {
      // TODO: use [UserFriendlyError]
      throw createWebsocketError(response.error);
    }

    return {
      docId,
      timestamp: new Date(response.data.timestamp),
    };
  }

  override async getDocTimestamps(after?: Date) {
    const response = await this.socket.emitWithAck(
      'space:load-doc-timestamps',
      {
        spaceType: this.spaceType,
        spaceId: this.spaceId,
        timestamp: after ? after.getTime() : undefined,
      }
    );

    if ('error' in response) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw createWebsocketError(response.error);
    }

    return Object.entries(response.data).reduce((ret, [docId, timestamp]) => {
      ret[this.idConverter.oldIdToNewId(docId)] = new Date(timestamp);
      return ret;
    }, {} as DocClocks);
  }

  override async deleteDoc(docId: string) {
    const response = await this.socket.emitWithAck('space:delete-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId: this.idConverter.newIdToOldId(docId),
    });

    if ('error' in response) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw createWebsocketError(response.error);
    }
  }

  async applyDocLifecycle(
    docId: string,
    lifecycle: 'trash' | 'restore' | 'delete'
  ) {
    const response = await this.socket.emitWithAck('space:doc-lifecycle', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId: this.idConverter.newIdToOldId(docId),
      lifecycle,
    });
    if ('error' in response) {
      throw createWebsocketError(response.error);
    }
    return {
      timestamp: new Date(response.data.timestamp),
    };
  }

  protected async setDocSnapshot() {
    return false;
  }
  protected async getDocUpdates() {
    return [];
  }
  protected async markUpdatesMerged() {
    return 0;
  }
}

class CloudDocStorageConnection extends SocketConnection {
  constructor(
    private readonly options: CloudDocStorageOptions,
    private readonly onServerUpdates: ServerEventsMap['space:broadcast-doc-updates'],
    private readonly onServerInvalidation: ServerEventsMap['space:broadcast-doc-invalidation']
  ) {
    super(options.serverBaseUrl, options.isSelfHosted);
  }

  readonly idConverter = createIdConverter(this.options.id);
  private readonly joinedDocIds = new Set<string>();

  async joinDoc(docId: string, socket: Socket = this.inner.socket) {
    const res = await socket.emitWithAck('space:join-batch', {
      spaces: [
        { spaceType: this.options.type, spaceId: this.options.id, docId },
      ],
      clientVersion: BUILD_CONFIG.appVersion,
      protocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
    });
    if ('error' in res) throw createWebsocketError(res.error);
    if (
      !res.data.success ||
      res.data.protocolVersion !== WORKSPACE_SYNC_PROTOCOL_VERSION
    )
      throw new Error('Space join was rejected');
    this.joinedDocIds.add(docId);
    return docId;
  }

  override async doConnect(signal?: AbortSignal) {
    const { socket, disconnect } = await super.doConnect(signal);

    try {
      await this.joinDoc(this.options.id, socket);

      socket.on('space:broadcast-doc-updates', this.onServerUpdates);
      socket.on('space:broadcast-doc-invalidation', this.onServerInvalidation);

      return { socket, disconnect };
    } catch (e) {
      this.doDisconnect({ socket, disconnect });
      throw e;
    }
  }

  override doDisconnect({
    socket,
    disconnect,
  }: {
    socket: Socket;
    disconnect: () => void;
  }) {
    const docIds = [...this.joinedDocIds];
    this.joinedDocIds.clear();
    for (
      let offset = 0;
      offset < docIds.length;
      offset += SPACE_JOIN_BATCH_LIMIT
    ) {
      socket.emit('space:leave-batch', {
        spaceType: this.options.type,
        spaceId: this.options.id,
        docIds: docIds.slice(offset, offset + SPACE_JOIN_BATCH_LIMIT),
      });
    }
    socket.emit('space:leave-batch', {
      spaceType: this.options.type,
      spaceId: this.options.id,
      docIds: [],
    });
    socket.off('space:broadcast-doc-updates', this.onServerUpdates);
    socket.off('space:broadcast-doc-invalidation', this.onServerInvalidation);
    super.doDisconnect({ socket, disconnect });
  }
}
