import {
  type Blob,
  BlobStorage,
  type DocStorageOptions,
  type ListedBlob,
} from '../../storage';
import type { Socket } from './socket';

interface CloudBlobStorageOptions extends DocStorageOptions {
  socket: Socket;
}

export class CloudBlobStorage extends BlobStorage<CloudBlobStorageOptions> {
  get socket() {
    return this.options.socket;
  }

  override async connect(): Promise<void> {
    // the event will be polled, there is no need to wait for socket to be connected
    await this.clientHandShake();
    // this.socket.on('space:broadcast-blob-update', this.onServerUpdates);
  }

  private async clientHandShake() {
    const res = await this.socket.emitWithAck('space:join', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      clientVersion: BUILD_CONFIG.appVersion,
    });

    if ('error' in res) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw new Error(res.error.message);
    }
  }

  override async disconnect(): Promise<void> {
    this.socket.emit('space:leave', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
    });
    // this.socket.off('space:broadcast-doc-updates', this.onServerUpdate);
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

export function uint8ArrayToBase64(array: Uint8Array): Promise<string> {
  return new Promise<string>(resolve => {
    // Create a blob from the Uint8Array
    const blob = new Blob([array]);

    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = reader.result as string | null;
      if (!dataUrl) {
        resolve('');
        return;
      }
      // The result includes the `data:` URL prefix and the MIME type. We only want the Base64 data
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };

    reader.readAsDataURL(blob);
  });
}

export function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const binaryArray = binaryString.split('').map(function (char) {
    return char.charCodeAt(0);
  });
  return new Uint8Array(binaryArray);
}
