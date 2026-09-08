import type { Socket } from 'socket.io-client';

import {
  type DocClock,
  type DocClocks,
  DocStorageBase,
  type DocStorageOptions,
  type DocUpdate,
} from '../../storage';
import { getIdConverter, type IdConverter } from '../../utils/id-converter';
import type { SpaceType } from '../../utils/universal-id';
import {
  base64ToUint8Array,
  type ServerEventsMap,
  SocketConnection,
  type SyncProtocol,
  uint8ArrayToBase64,
} from './socket';

interface CloudDocStorageOptions extends DocStorageOptions {
  serverBaseUrl: string;
  isSelfHosted: boolean;
  syncProtocol: SyncProtocol;
  type: SpaceType;
}

function createWebsocketError(error: { name: string; message: string }) {
  const err = new Error(error.message);
  err.name = error.name;
  return err;
}

export class CloudDocStorage extends DocStorageBase<CloudDocStorageOptions> {
  static readonly identifier = 'CloudDocStorage';

  get socket() {
    return this.connection.inner.socket;
  }
  get idConverter() {
    if (!this.connection.idConverter) {
      throw new Error('Id converter not initialized');
    }
    return this.connection.idConverter;
  }
  readonly spaceType = this.options.type;

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
        this.options.syncProtocol !== 'batch' ||
        this.spaceType !== message.spaceType ||
        this.spaceId !== message.spaceId
      ) {
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
      docId: this.idConverter.newIdToOldId(docId),
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
      docId: this.idConverter.newIdToOldId(docId),
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
      docId: this.idConverter.newIdToOldId(update.docId),
      update: await uint8ArrayToBase64(update.bin),
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
      docId: this.idConverter.newIdToOldId(docId),
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

  idConverter: IdConverter | null = null;

  override async doConnect(signal?: AbortSignal) {
    const { socket, disconnect } = await super.doConnect(signal);

    try {
      const res =
        this.options.syncProtocol === 'batch'
          ? await socket.emitWithAck('space:join-batch', {
              spaces: [
                {
                  spaceType: this.options.type,
                  spaceId: this.options.id,
                },
              ],
              clientVersion: BUILD_CONFIG.appVersion,
            })
          : await socket.emitWithAck('space:join', {
              spaceType: this.options.type,
              spaceId: this.options.id,
              clientVersion: BUILD_CONFIG.appVersion,
            });

      if ('error' in res) {
        throw createWebsocketError(res.error);
      }
      if (!res.data.success) {
        throw new Error('Space join was rejected');
      }

      if (!this.idConverter) {
        this.idConverter = await this.getIdConverter(socket);
      }

      socket.on('space:broadcast-doc-updates', this.onServerUpdates);
      socket.on('space:broadcast-doc-invalidation', this.onServerInvalidation);

      return { socket, disconnect };
    } catch (e) {
      disconnect();
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
    if (this.options.syncProtocol === 'batch') {
      socket.emit('space:leave-batch', {
        spaceType: this.options.type,
        spaceId: this.options.id,
        docIds: [],
      });
    } else {
      socket.emit('space:leave', {
        spaceType: this.options.type,
        spaceId: this.options.id,
      });
    }
    socket.off('space:broadcast-doc-updates', this.onServerUpdates);
    socket.off('space:broadcast-doc-invalidation', this.onServerInvalidation);
    super.doDisconnect({ socket, disconnect });
  }

  async getIdConverter(socket: Socket) {
    return getIdConverter(
      {
        getDocBuffer: async id => {
          const response = await socket.emitWithAck('space:load-doc', {
            spaceType: this.options.type,
            spaceId: this.options.id,
            docId: id,
          });

          if ('error' in response) {
            if (response.error.name === 'DOC_NOT_FOUND') {
              return null;
            }
            // TODO: use [UserFriendlyError]
            throw createWebsocketError(response.error);
          }

          return base64ToUint8Array(response.data.missing);
        },
      },
      this.options.id
    );
  }
}
