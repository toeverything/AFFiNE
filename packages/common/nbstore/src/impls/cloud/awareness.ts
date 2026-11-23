import type { Socket } from 'socket.io-client';

import {
  type AwarenessRecord,
  AwarenessStorageBase,
} from '../../storage/awareness';
import { createIdConverter } from '../../utils/id-converter';
import type { SpaceType } from '../../utils/universal-id';
import type { CloudDocStorage } from './doc';
import {
  base64ToUint8Array,
  SocketConnection,
  SPACE_JOIN_BATCH_LIMIT,
  uint8ArrayToBase64,
  WORKSPACE_SYNC_PROTOCOL_VERSION,
} from './socket';

interface CloudAwarenessStorageOptions {
  isSelfHosted: boolean;
  serverBaseUrl: string;
  type: SpaceType;
  id: string;
  protocolVersion?: 1 | 2;
}

export class CloudAwarenessStorage extends AwarenessStorageBase {
  static readonly identifier = 'CloudAwarenessStorage';

  constructor(private readonly options: CloudAwarenessStorageOptions) {
    super();
  }

  private docStorage?: CloudDocStorage;
  private readonly defaultIdConverter = createIdConverter(this.options.id);

  bindDocStorage(storage: CloudDocStorage) {
    this.docStorage = storage;
  }

  private get idConverter() {
    return this.docStorage?.idConverter ?? this.defaultIdConverter;
  }

  private get protocolVersion() {
    return (
      this.docStorage?.protocolVersion ??
      this.options.protocolVersion ??
      WORKSPACE_SYNC_PROTOCOL_VERSION
    );
  }

  connection = new CloudAwarenessConnection(
    this.options,
    () => this.activeAwarenessIds.size > 0,
    () => this.protocolVersion
  );

  private get socket() {
    return this.connection.inner.socket;
  }

  private readonly activeAwarenessIds = new Set<string>();
  private readonly joinedAwarenessIds = new Set<string>();
  private joinPromise: Promise<void> | undefined;

  private joinActiveAwareness(socket: Socket): Promise<void> {
    if (this.activeAwarenessIds.size === 0) {
      return Promise.resolve();
    }

    if (this.joinPromise) {
      return this.joinPromise;
    }

    const batchPromise = Promise.resolve().then(async () => {
      await this.docStorage?.connection.waitForConnected();
      while (socket.connected && this.joinPromise === sharedPromise) {
        const pendingIds = [...this.activeAwarenessIds].filter(
          docId => !this.joinedAwarenessIds.has(docId)
        );
        if (pendingIds.length === 0) {
          return;
        }

        for (
          let index = 0;
          index < pendingIds.length;
          index += SPACE_JOIN_BATCH_LIMIT
        ) {
          const spaces = pendingIds
            .slice(index, index + SPACE_JOIN_BATCH_LIMIT)
            .map(docId => ({
              spaceType: this.options.type,
              spaceId: this.options.id,
              docId: this.idConverter.newIdToOldId(docId),
            }));
          const response = await socket.emitWithAck('space:join-batch', {
            spaces,
            clientVersion: BUILD_CONFIG.appVersion,
            protocolVersion: this.protocolVersion,
          });

          if (this.joinPromise !== sharedPromise) return;
          if ('error' in response) {
            throw Object.assign(new Error(response.error.message), {
              name: response.error.name,
            });
          }
          if (
            !response.data.success ||
            response.data.protocolVersion !== this.protocolVersion
          ) {
            throw new Error('Awareness join was rejected');
          }
        }

        for (const docId of pendingIds) {
          if (this.activeAwarenessIds.has(docId)) {
            this.joinedAwarenessIds.add(docId);
          }
        }
      }
    });

    const sharedPromise = batchPromise.finally(() => {
      if (this.joinPromise === sharedPromise) this.joinPromise = undefined;
    });
    this.joinPromise = sharedPromise;
    return sharedPromise;
  }

  override async update(record: AwarenessRecord): Promise<void> {
    await this.docStorage?.connection.waitForConnected();
    const encodedUpdate = await uint8ArrayToBase64(record.bin);
    this.socket.emit('space:update-awareness', {
      spaceType: this.options.type,
      spaceId: this.options.id,
      docId: this.idConverter.newIdToOldId(record.docId),
      awarenessUpdate: encodedUpdate,
    });
  }

  override subscribeUpdate(
    id: string,
    onUpdate: (update: AwarenessRecord, origin?: string) => void,
    onCollect: () => Promise<AwarenessRecord | null>
  ): () => void {
    this.activeAwarenessIds.add(id);
    let subscribed = true;
    let listeningSocket: Socket | undefined;
    let joinGeneration = 0;
    const removeListeners = () => {
      joinGeneration++;
      listeningSocket?.off('space:collect-awareness', handleCollectAwareness);
      listeningSocket?.off(
        'space:broadcast-awareness-update',
        handleBroadcastAwarenessUpdate
      );
      listeningSocket = undefined;
    };

    // leave awareness
    const leave = () => {
      subscribed = false;
      this.activeAwarenessIds.delete(id);
      this.joinedAwarenessIds.delete(id);
      removeListeners();
      if (this.connection.status !== 'connected') return;
      this.socket.emit('space:leave-batch', {
        spaceType: this.options.type,
        spaceId: this.options.id,
        docIds: [this.idConverter.newIdToOldId(id)],
      });
    };

    // join awareness, and collect awareness from others
    const joinAndCollect = async () => {
      removeListeners();
      const generation = joinGeneration;
      const socket = this.socket;
      listeningSocket = socket;
      socket.on('space:collect-awareness', handleCollectAwareness);
      socket.on(
        'space:broadcast-awareness-update',
        handleBroadcastAwarenessUpdate
      );
      await this.joinActiveAwareness(socket);
      if (
        !subscribed ||
        generation !== joinGeneration ||
        this.connection.status !== 'connected' ||
        listeningSocket !== socket
      )
        return;
      socket.emit('space:load-awarenesses', {
        spaceType: this.options.type,
        spaceId: this.options.id,
        docId: this.idConverter.newIdToOldId(id),
      });
    };

    const handleCollectAwareness = ({
      spaceId,
      spaceType,
      docId,
    }: {
      spaceId: string;
      spaceType: string;
      docId: string;
    }) => {
      if (
        spaceId === this.options.id &&
        spaceType === this.options.type &&
        this.idConverter.oldIdToNewId(docId) === id
      ) {
        (async () => {
          const socket = listeningSocket;
          const record = await onCollect();
          if (record) {
            const encodedUpdate = await uint8ArrayToBase64(record.bin);
            if (!subscribed || !socket || listeningSocket !== socket) return;
            socket.emit('space:update-awareness', {
              spaceType: this.options.type,
              spaceId: this.options.id,
              docId: this.idConverter.newIdToOldId(record.docId),
              awarenessUpdate: encodedUpdate,
            });
          }
        })().catch(err => console.error('awareness upload failed', err));
      }
    };

    const handleBroadcastAwarenessUpdate = ({
      spaceType,
      spaceId,
      docId,
      awarenessUpdate,
    }: {
      spaceType: string;
      spaceId: string;
      docId: string;
      awarenessUpdate: string;
    }) => {
      if (
        spaceId === this.options.id &&
        spaceType === this.options.type &&
        this.idConverter.oldIdToNewId(docId) === id
      ) {
        onUpdate({
          bin: base64ToUint8Array(awarenessUpdate),
          docId: id,
        });
      }
    };

    if (this.connection.status === 'connected') {
      joinAndCollect().catch(error => this.connection.handleJoinError(error));
    }

    const unsubscribeConnectionStatusChanged = this.connection.onStatusChanged(
      status => {
        if (status !== 'connected') {
          this.joinedAwarenessIds.clear();
          this.joinPromise = undefined;
          removeListeners();
        }
        if (status === 'connected') {
          joinAndCollect().catch(error =>
            this.connection.handleJoinError(error)
          );
        }
      }
    );

    return () => {
      leave();

      unsubscribeConnectionStatusChanged();
    };
  }
}

class CloudAwarenessConnection extends SocketConnection {
  constructor(
    private readonly options: CloudAwarenessStorageOptions,
    private readonly hasActiveAwareness: () => boolean,
    private readonly protocolVersion: () => 1 | 2
  ) {
    super(options.serverBaseUrl, options.isSelfHosted);
  }

  handleJoinError(error: unknown) {
    if (error instanceof Error && error.name === 'WORKSPACE_SYNC_UNAVAILABLE') {
      if (this.status === 'connected') this.error = error;
    } else {
      console.error('awareness join failed', error);
    }
  }

  override async doConnect(signal?: AbortSignal) {
    const connection = await super.doConnect(signal);
    if (
      this.error?.name === 'WORKSPACE_SYNC_UNAVAILABLE' &&
      this.hasActiveAwareness()
    ) {
      try {
        const response = await connection.socket.emitWithAck(
          'space:join-batch',
          {
            spaces: [
              { spaceType: this.options.type, spaceId: this.options.id },
            ],
            clientVersion: BUILD_CONFIG.appVersion,
            protocolVersion: this.protocolVersion(),
          }
        );
        if ('error' in response) {
          throw Object.assign(new Error(response.error.message), {
            name: response.error.name,
          });
        }
        if (
          !response.data.success ||
          response.data.protocolVersion !== this.protocolVersion()
        ) {
          throw new Error('Awareness join was rejected');
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'WORKSPACE_SYNC_UNAVAILABLE'
        ) {
          this.doDisconnect(connection);
          throw error;
        }
        console.error('awareness join failed', error);
      }
    }
    return connection;
  }
}
