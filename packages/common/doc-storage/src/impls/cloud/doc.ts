import { DocStorage, type DocStorageOptions } from '../../storage';
import type { ServerEventsMap, Socket } from './socket';

interface CloudDocStorageOptions extends DocStorageOptions {
  socket: Socket;
}

export class CloudDocStorage extends DocStorage<CloudDocStorageOptions> {
  get name() {
    // @ts-expect-error we need it
    return this.options.socket.io.uri;
  }

  get socket() {
    return this.options.socket;
  }

  override async connect(): Promise<void> {
    // the event will be polled, there is no need to wait for socket to be connected
    await this.clientHandShake();
    this.socket.on('space:broadcast-doc-updates', this.onServerUpdates);
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
    this.socket.off('space:broadcast-doc-updates', this.onServerUpdates);
  }

  onServerUpdates: ServerEventsMap['space:broadcast-doc-updates'] = message => {
    if (
      this.spaceType === message.spaceType &&
      this.spaceId === message.spaceId
    ) {
      this.dispatchDocUpdatesListeners(
        message.docId,
        message.updates.map(base64ToUint8Array),
        message.timestamp
      );
    }
  };

  override async getDocSnapshot(docId: string) {
    const response = await this.socket.emitWithAck('space:load-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId,
    });

    if ('error' in response) {
      // TODO: use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return {
      spaceId: this.spaceId,
      docId,
      bin: base64ToUint8Array(response.data.missing),
      timestamp: response.data.timestamp,
    };
  }

  override async getDocDiff(docId: string, stateVector?: Uint8Array) {
    const response = await this.socket.emitWithAck('space:load-doc', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId,
      stateVector: stateVector ? await uint8ArrayToBase64(stateVector) : void 0,
    });

    if ('error' in response) {
      // TODO: use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return {
      missing: base64ToUint8Array(response.data.missing),
      state: base64ToUint8Array(response.data.state),
      timestamp: response.data.timestamp,
    };
  }

  async pushDocUpdates(docId: string, updates: Uint8Array[]): Promise<number> {
    const response = await this.socket.emitWithAck('space:push-doc-updates', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      docId,
      updates: await Promise.all(updates.map(uint8ArrayToBase64)),
    });

    if ('error' in response) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return response.data.timestamp;
  }

  async getSpaceDocTimestamps(
    after?: number
  ): Promise<Record<string, number> | null> {
    const response = await this.socket.emitWithAck(
      'space:load-doc-timestamps',
      {
        spaceType: this.spaceType,
        spaceId: this.spaceId,
        timestamp: after,
      }
    );

    if ('error' in response) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw new Error(response.error.message);
    }

    return response.data;
  }

  async deleteDoc(): Promise<void> {}
  async deleteSpace(): Promise<void> {}
  protected async setDocSnapshot() {
    return false;
  }
  protected async getDocUpdates() {
    return [];
  }
  protected async markUpdatesMerged() {
    return 0;
  }
  override async listDocHistories() {
    return [];
  }
  override async getDocHistory() {
    return null;
  }
  protected override async createDocHistory() {
    return false;
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
