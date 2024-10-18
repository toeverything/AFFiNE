import {
  type Blob,
  BlobStorage,
  type BlobStorageOptions,
  type ListedBlob,
} from '../../storage';
import {
  base64ToUint8Array,
  type Socket,
  SocketProtocol,
  uint8ArrayToBase64,
} from './socket';

interface CloudBlobStorageOptions extends BlobStorageOptions {
  socket: Socket;
}

export class CloudBlobStorage extends BlobStorage<CloudBlobStorageOptions> {
  private get socket() {
    return this.options.socket;
  }

  override async connect(): Promise<void> {
    this.socket.connect();
    await SocketProtocol.join(this.socket, this.spaceType, this.spaceId);
    // this.socket.on('space:broadcast-blob-update', this.onServerUpdates);
  }

  override async disconnect(): Promise<void> {
    // this.socket.off('space:broadcast-doc-updates', this.onServerUpdate);
    SocketProtocol.leave(this.socket, this.spaceType, this.spaceId);
    this.socket.disconnect();
  }

  // onServerUpdate: ServerEventsMap['space:broadcast-blob-update'] = message => {
  //   if (
  //     this.spaceType === message.spaceType &&
  //     this.spaceId === message.spaceId
  //   ) {
  //     // how do we deal with the data?
  //   }
  // };

  override async getBlob(key: string): Promise<Blob | null> {
    const res = await this.socket.emitWithAck('space:get-blob', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      key,
    });

    if ('error' in res) {
      // TODO: use [UserFriendlyError]
      throw new Error(res.error.message);
    }

    return {
      ...res.data,
      data: base64ToUint8Array(res.data.data),
    };
  }

  override async setBlob(blob: Blob): Promise<void> {
    this.socket.emit('space:set-blob', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      key: blob.key,
      data: await uint8ArrayToBase64(blob.data),
      mime: blob.mime,
    });
  }

  override async deleteBlob(key: string, permanently: boolean): Promise<void> {
    this.socket.emit('space:delete-blob', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      key,
      permanently,
    });
  }

  override async releaseBlobs(): Promise<void> {
    this.socket.emit('space:release-blobs', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
    });
  }

  override async listBlobs(): Promise<ListedBlob[]> {
    const res = await this.socket.emitWithAck('space:list-blobs', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
    });

    if ('error' in res) {
      // TODO: use [UserFriendlyError]
      throw new Error(res.error.message);
    }

    return res.data;
  }
}
