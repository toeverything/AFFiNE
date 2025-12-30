import { AutoReconnectConnection } from '../../connection';
import type {
  BlobRecord,
  CrawlResult,
  DocClock,
  DocIndexedClock,
  DocRecord,
  ListedBlobRecord,
} from '../../storage';
import { type SpaceType, universalId } from '../../utils/universal-id';

export interface SqliteNativeDBOptions {
  readonly flavour: string;
  readonly type: SpaceType;
  readonly id: string;
}

export interface NativeDBApis {
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  pushUpdate: (id: string, docId: string, update: Uint8Array) => Promise<Date>;
  getDocSnapshot: (id: string, docId: string) => Promise<DocRecord | null>;
  setDocSnapshot: (id: string, snapshot: DocRecord) => Promise<boolean>;
  getDocUpdates: (id: string, docId: string) => Promise<DocRecord[]>;
  markUpdatesMerged: (
    id: string,
    docId: string,
    updates: Date[]
  ) => Promise<number>;
  deleteDoc: (id: string, docId: string) => Promise<void>;
  getDocClocks: (id: string, after?: Date | null) => Promise<DocClock[]>;
  getDocClock: (id: string, docId: string) => Promise<DocClock | null>;
  getDocIndexedClock: (
    id: string,
    docId: string
  ) => Promise<DocIndexedClock | null>;
  setDocIndexedClock: (
    id: string,
    docId: string,
    indexedClock: Date,
    indexerVersion: number
  ) => Promise<void>;
  clearDocIndexedClock: (id: string, docId: string) => Promise<void>;
  getBlob: (id: string, key: string) => Promise<BlobRecord | null>;
  setBlob: (id: string, blob: BlobRecord) => Promise<void>;
  deleteBlob: (id: string, key: string, permanently: boolean) => Promise<void>;
  releaseBlobs: (id: string) => Promise<void>;
  listBlobs: (id: string) => Promise<ListedBlobRecord[]>;
  getPeerRemoteClocks: (id: string, peer: string) => Promise<DocClock[]>;
  getPeerRemoteClock: (
    id: string,
    peer: string,
    docId: string
  ) => Promise<DocClock | null>;
  setPeerRemoteClock: (
    id: string,
    peer: string,
    docId: string,
    clock: Date
  ) => Promise<void>;
  getPeerPulledRemoteClocks: (id: string, peer: string) => Promise<DocClock[]>;
  getPeerPulledRemoteClock: (
    id: string,
    peer: string,
    docId: string
  ) => Promise<DocClock | null>;
  setPeerPulledRemoteClock: (
    id: string,
    peer: string,
    docId: string,
    clock: Date
  ) => Promise<void>;
  getPeerPushedClocks: (id: string, peer: string) => Promise<DocClock[]>;
  getPeerPushedClock: (
    id: string,
    peer: string,
    docId: string
  ) => Promise<DocClock | null>;
  setPeerPushedClock: (
    id: string,
    peer: string,
    docId: string,
    clock: Date
  ) => Promise<void>;
  clearClocks: (id: string) => Promise<void>;
  setBlobUploadedAt: (
    id: string,
    peer: string,
    blobId: string,
    uploadedAt: Date | null
  ) => Promise<void>;
  getBlobUploadedAt: (
    id: string,
    peer: string,
    blobId: string
  ) => Promise<Date | null>;
  crawlDocData: (id: string, docId: string) => Promise<CrawlResult>;
  ftsAddDocument: (
    id: string,
    indexName: string,
    docId: string,
    text: string,
    index: boolean
  ) => Promise<void>;
  ftsDeleteDocument: (
    id: string,
    indexName: string,
    docId: string
  ) => Promise<void>;
  ftsSearch: (
    id: string,
    indexName: string,
    query: string
  ) => Promise<{ id: string; score: number; terms: Array<string> }[]>;
  ftsGetDocument: (
    id: string,
    indexName: string,
    docId: string
  ) => Promise<string | null>;
  ftsGetMatches: (
    id: string,
    indexName: string,
    docId: string,
    query: string
  ) => Promise<{ start: number; end: number }[]>;
  ftsFlushIndex: (id: string) => Promise<void>;
  ftsIndexVersion: () => Promise<number>;
}

type NativeDBApisWrapper = NativeDBApis extends infer APIs
  ? {
      [K in keyof APIs]: APIs[K] extends (...args: any[]) => any
        ? Parameters<APIs[K]> extends [string, ...infer Rest]
          ? (...args: Rest) => ReturnType<APIs[K]>
          : (...args: Parameters<APIs[K]>) => ReturnType<APIs[K]>
        : never;
    }
  : never;

let apis: NativeDBApis | null = null;

export function bindNativeDBApis(a: NativeDBApis) {
  apis = a;
}

export class NativeDBConnection extends AutoReconnectConnection<void> {
  readonly apis: NativeDBApisWrapper;

  readonly flavour = this.options.flavour;
  readonly type = this.options.type;
  readonly id = this.options.id;

  constructor(private readonly options: SqliteNativeDBOptions) {
    super();

    if (!apis) {
      throw new Error('Not in native context.');
    }

    this.apis = this.warpApis(apis);
  }

  override get shareId(): string {
    return `sqlite:${this.flavour}:${this.type}:${this.id}`;
  }

  warpApis(originalApis: NativeDBApis): NativeDBApisWrapper {
    const id = universalId({
      peer: this.flavour,
      type: this.type,
      id: this.id,
    });
    return new Proxy(
      {},
      {
        get: (_target, key: keyof NativeDBApisWrapper) => {
          const v = originalApis[key];

          return async (...args: any[]) => {
            return v.call(
              originalApis,
              id,
              // @ts-expect-error I don't know why it complains ts(2556)
              ...args
            );
          };
        },
      }
    ) as unknown as NativeDBApisWrapper;
  }

  override async doConnect() {
    await this.apis.connect();
  }

  override doDisconnect() {
    this.apis.disconnect().catch(err => {
      console.error('NativeDBConnection close failed', err);
    });
  }
}
