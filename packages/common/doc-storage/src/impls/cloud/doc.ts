import { DocStorage, type DocStorageOptions } from '../../storage';
import {
  base64ToUint8Array,
  type ServerEventsMap,
  type Socket,
  uint8ArrayToBase64,
} from './socket';

interface CloudDocStorageOptions extends DocStorageOptions {
  endpoint: string;
  socket: Socket;
}

export class CloudDocStorage extends DocStorage<CloudDocStorageOptions> {
  private get socket() {
    return this.options.socket;
  }

  get name() {
    return this.options.endpoint;
  }

  override async doConnect(): Promise<void> {
    const res = await this.socket.emitWithAck('space:join', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
      clientVersion: BUILD_CONFIG.appVersion,
    });

    if ('error' in res) {
      throw new Error(res.error.message);
    }
    this.socket?.on('space:broadcast-doc-updates', this.onServerUpdates);
  }

  override async doDisconnect(): Promise<void> {
    this.socket.emit('space:leave', {
      spaceType: this.spaceType,
      spaceId: this.spaceId,
    });
    this.socket?.off('space:broadcast-doc-updates', this.onServerUpdates);
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
