import {
  type AwarenessRecord,
  AwarenessStorageBase,
} from '../../storage/awareness';
import type { SpaceType } from '../../utils/universal-id';
import {
  base64ToUint8Array,
  SocketConnection,
  uint8ArrayToBase64,
} from './socket';

interface CloudAwarenessStorageOptions {
  isSelfHosted: boolean;
  serverBaseUrl: string;
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
    // leave awareness
    const leave = () => {
      if (this.connection.status !== 'connected') return;
      this.socket.off('space:collect-awareness', handleCollectAwareness);
      this.socket.off(
        'space:broadcast-awareness-update',
        handleBroadcastAwarenessUpdate
      );
      this.socket.emit('space:leave-awareness', {
        spaceType: this.options.type,
        spaceId: this.options.id,
        docId: id,
      });
    };

    // join awareness, and collect awareness from others
    const joinAndCollect = async () => {
      this.socket.on('space:collect-awareness', handleCollectAwareness);
      this.socket.on(
        'space:broadcast-awareness-update',
        handleBroadcastAwarenessUpdate
      );
      await this.socket.emitWithAck('space:join-awareness', {
        spaceType: this.options.type,
        spaceId: this.options.id,
        docId: id,
        clientVersion: BUILD_CONFIG.appVersion,
      });
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
