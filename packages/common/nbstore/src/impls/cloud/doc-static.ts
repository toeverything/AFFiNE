import {
  type DocClock,
  type DocClocks,
  type DocRecord,
  DocStorageBase,
  type DocStorageOptions,
  type DocUpdate,
} from '../../storage';
import { HttpConnection } from './http';

interface CloudDocStorageOptions extends DocStorageOptions {
  serverBaseUrl: string;
}

export class StaticCloudDocStorage extends DocStorageBase<CloudDocStorageOptions> {
  static readonly identifier = 'StaticCloudDocStorage';

  constructor(options: CloudDocStorageOptions) {
    super({ ...options, readonlyMode: true });
  }

  override connection = new HttpConnection(this.options.serverBaseUrl);
  override async pushDocUpdate(
    update: DocUpdate,
    _origin?: string
  ): Promise<DocClock> {
    // http is readonly
    return { docId: update.docId, timestamp: new Date() };
  }
  override async getDocTimestamp(docId: string): Promise<DocClock | null> {
    // http doesn't support this, so we just return a new timestamp
    return {
      docId,
      timestamp: new Date(),
    };
  }
  override async getDocTimestamps(): Promise<DocClocks> {
    // http doesn't support this
    return {};
  }
  override deleteDoc(_docId: string): Promise<void> {
    // http is readonly
    return Promise.resolve();
  }
  protected override async getDocSnapshot(
    docId: string
  ): Promise<DocRecord | null> {
    try {
      const arrayBuffer = await this.connection.fetchArrayBuffer(
        `/api/workspaces/${this.spaceId}/docs/${docId}`,
        {
          priority: 'high',
          headers: {
            Accept: 'application/octet-stream', // this is necessary for ios native fetch to return arraybuffer
          },
        }
      );
      if (!arrayBuffer) {
        return null;
      }
      return {
        docId: docId,
        bin: new Uint8Array(arrayBuffer),
        timestamp: new Date(),
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }
  protected override setDocSnapshot(
    _snapshot: DocRecord,
    _prevSnapshot: DocRecord | null
  ): Promise<boolean> {
    // http is readonly
    return Promise.resolve(false);
  }
  protected override getDocUpdates(_docId: string): Promise<DocRecord[]> {
    return Promise.resolve([]);
  }
  protected override markUpdatesMerged(
    _docId: string,
    _updates: DocRecord[]
  ): Promise<number> {
    return Promise.resolve(0);
  }
}
