import {
  type AwarenessRecord,
  AwarenessStorageBase,
} from '../../storage/awareness';
import type { SpaceType } from '../../utils/universal-id';
import {
  base64ToUint8Array,
  SocketConnection,
  SPACE_JOIN_BATCH_LIMIT,
  type SyncProtocol,
  uint8ArrayToBase64,
} from './socket';

interface CloudAwarenessStorageOptions {
  isSelfHosted: boolean;
  serverBaseUrl: string;
  syncProtocol: SyncProtocol;
  type: SpaceType;
  id: string;
}

export class CloudAwarenessStorage extends AwarenessStorageBase {
  static readonly identifier = 'CloudAwarenessStorage';

  constructor(private readonly options: CloudAwarenessStorageOptions) {
    super();
  }

  connection = new SocketConnection(
    this.options.serverBaseUrl,
    this.options.isSelfHosted
  );

  private get socket() {
    return this.connection.inner.socket;
  }

  private readonly activeAwarenessIds = new Set<string>();
  private readonly joinedAwarenessIds = new Set<string>();
  private joinPromise: Promise<void> | undefined;

  private joinActiveAwareness(): Promise<void> {
    if (
      this.connection.status !== 'connected' ||
      this.activeAwarenessIds.size === 0
    ) {
      return Promise.resolve();
    }

    if (this.joinPromise) {
      return this.joinPromise;
    }

    const batchPromise = (async () => {
      while (this.connection.status === 'connected') {
        await Promise.resolve();
        const pendingIds = [...this.activeAwarenessIds].filter(
          docId => !this.joinedAwarenessIds.has(docId)
        );
        if (pendingIds.length === 0) {
          return;
        }

        if (this.options.syncProtocol === 'batch') {
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
                docId,
              }));
            const response = await this.socket.emitWithAck('space:join-batch', {
              spaces,
              clientVersion: BUILD_CONFIG.appVersion,
            });

            if ('error' in response) {
              throw new Error(
                `Awareness join failed: ${response.error.name}: ${response.error.message}`
              );
            }
            if (!response.data.success) {
              throw new Error('Awareness join was rejected');
            }
          }
        } else {
          for (const docId of pendingIds) {
            const response = await this.socket.emitWithAck(
              'space:join-awareness',
              {
                spaceType: this.options.type,
                spaceId: this.options.id,
                docId,
                clientVersion: BUILD_CONFIG.appVersion,
              }
            );

            if ('error' in response) {
              throw new Error(
                `Awareness join failed: ${response.error.name}: ${response.error.message}`
              );
            }
            if (!response.data.success) {
              throw new Error('Awareness join was rejected');
            }
          }
        }

        for (const docId of pendingIds) {
          if (this.activeAwarenessIds.has(docId)) {
            this.joinedAwarenessIds.add(docId);
          }
        }
      }
    })();

    const sharedPromise = batchPromise.finally(() => {
      this.joinPromise = undefined;
    });
    this.joinPromise = sharedPromise;
    return sharedPromise;
  }

  override async update(record: AwarenessRecord): Promise<void> {
    const encodedUpdate = await uint8ArrayToBase64(record.bin);
    this.socket.emit('space:update-awareness', {
      spaceType: this.options.type,
      spaceId: this.options.id,
      docId: record.docId,
      awarenessUpdate: encodedUpdate,
    });
  }

  override subscribeUpdate(
    id: string,
    onUpdate: (update: AwarenessRecord, origin?: string) => void,
    onCollect: () => Promise<AwarenessRecord | null>
  ): () => void {
    this.activeAwarenessIds.add(id);

    // leave awareness
    const leave = () => {
      this.activeAwarenessIds.delete(id);
      this.joinedAwarenessIds.delete(id);
      this.socket.off('space:collect-awareness', handleCollectAwareness);
      this.socket.off(
        'space:broadcast-awareness-update',
        handleBroadcastAwarenessUpdate
      );
      if (this.connection.status !== 'connected') return;
      if (this.options.syncProtocol === 'batch') {
        this.socket.emit('space:leave-batch', {
          spaceType: this.options.type,
          spaceId: this.options.id,
          docIds: [id],
        });
      } else {
        this.socket.emit('space:leave-awareness', {
          spaceType: this.options.type,
          spaceId: this.options.id,
          docId: id,
        });
      }
    };

    // join awareness, and collect awareness from others
    const joinAndCollect = async () => {
      this.socket.on('space:collect-awareness', handleCollectAwareness);
      this.socket.on(
        'space:broadcast-awareness-update',
        handleBroadcastAwarenessUpdate
      );
      await this.joinActiveAwareness();
      if (this.connection.status !== 'connected') return;
      this.socket.emit('space:load-awarenesses', {
        spaceType: this.options.type,
        spaceId: this.options.id,
        docId: id,
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
        docId === id
      ) {
        (async () => {
          const record = await onCollect();
          if (record) {
            const encodedUpdate = await uint8ArrayToBase64(record.bin);
            this.socket.emit('space:update-awareness', {
              spaceType: this.options.type,
              spaceId: this.options.id,
              docId: record.docId,
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
        docId === id
      ) {
        onUpdate({
          bin: base64ToUint8Array(awarenessUpdate),
          docId: id,
        });
      }
    };

    if (this.connection.status === 'connected') {
      joinAndCollect().catch(err =>
        console.error('awareness join failed', err)
      );
    }

    const unsubscribeConnectionStatusChanged = this.connection.onStatusChanged(
      status => {
        if (status !== 'connected') {
          this.joinedAwarenessIds.clear();
        }
        if (status === 'connected') {
          joinAndCollect().catch(err =>
            console.error('awareness join failed', err)
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
