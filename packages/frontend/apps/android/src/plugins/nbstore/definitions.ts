import type { CrawlResult, DocIndexedClock } from '@affine/nbstore';
import type {
  NativeIndexField,
  NativeIndexHit,
  NativeIndexQuery,
  NativeIndexSearchOptions,
  NativeIndexSearchResult,
} from '@affine/nbstore/sqlite';

type NativeIndexDocument = { id: string; fields: NativeIndexField[] };
type NativeIndexAggregateResult = {
  total: number;
  buckets: {
    key: string;
    count: number;
    score: number;
    hits: NativeIndexHit[];
  }[];
};

export interface Blob {
  key: string;
  // base64 encoded data, or "__AFFINE_BLOB_FILE__:<absolutePath>" for large blobs
  data: string;
  mime: string;
  size: number;
  createdAt: number;
}

export interface SetBlob {
  key: string;
  // base64 encoded data
  data: string;
  mime: string;
}

export interface ListedBlob {
  key: string;
  mime: string;
  size: number;
  createdAt: number;
}

export interface DocClock {
  docId: string;
  timestamp: number;
}

export interface NbStorePlugin {
  connect: (options: {
    id: string;
    spaceId: string;
    spaceType: string;
    peer: string;
  }) => Promise<void>;
  disconnect: (options: { id: string }) => Promise<void>;

  setSpaceId: (options: { id: string; spaceId: string }) => Promise<void>;
  pushUpdate: (options: {
    id: string;
    docId: string;
    // base64 encoded data
    data: string;
  }) => Promise<{ timestamp: number }>;
  getDocSnapshot: (options: { id: string; docId: string }) => Promise<
    | {
        docId: string;
        // base64 encoded data
        bin: string;
        timestamp: number;
      }
    | undefined
  >;
  setDocSnapshot: (options: {
    id: string;
    docId: string;
    // base64 encoded data
    bin: string;
    timestamp: number;
  }) => Promise<{ success: boolean }>;
  getDocUpdates: (options: { id: string; docId: string }) => Promise<{
    updates: {
      docId: string;
      timestamp: number;
      // base64 encoded data
      bin: string;
    }[];
  }>;
  markUpdatesMerged: (options: {
    id: string;
    docId: string;
    timestamps: number[];
  }) => Promise<{ count: number }>;
  deleteDoc: (options: { id: string; docId: string }) => Promise<void>;
  getDocClocks: (options: { id: string; after?: number | null }) => Promise<{
    clocks: {
      docId: string;
      timestamp: number;
    }[];
  }>;
  getDocClock: (options: { id: string; docId: string }) => Promise<
    | {
        docId: string;
        timestamp: number;
      }
    | undefined
  >;
  getBlob: (options: { id: string; key: string }) => Promise<Blob | null>;
  setBlob: (options: { id: string } & SetBlob) => Promise<void>;
  deleteBlob: (options: {
    id: string;
    key: string;
    permanently: boolean;
  }) => Promise<void>;
  releaseBlobs: (options: { id: string }) => Promise<void>;
  listBlobs: (options: { id: string }) => Promise<{ blobs: Array<ListedBlob> }>;
  getPeerRemoteClocks: (options: {
    id: string;
    peer: string;
  }) => Promise<{ clocks: Array<DocClock> }>;
  getPeerRemoteClock: (options: {
    id: string;
    peer: string;
    docId: string;
  }) => Promise<DocClock | null>;
  setPeerRemoteClock: (options: {
    id: string;
    peer: string;
    docId: string;
    timestamp: number;
  }) => Promise<void>;
  getPeerPushedClocks: (options: {
    id: string;
    peer: string;
  }) => Promise<{ clocks: Array<DocClock> }>;
  getPeerPushedClock: (options: {
    id: string;
    peer: string;
    docId: string;
  }) => Promise<DocClock | null>;
  setPeerPushedClock: (options: {
    id: string;
    peer: string;
    docId: string;
    timestamp: number;
  }) => Promise<void>;
  getPeerPulledRemoteClocks: (options: {
    id: string;
    peer: string;
  }) => Promise<{ clocks: Array<DocClock> }>;
  getPeerPulledRemoteClock: (options: {
    id: string;
    peer: string;
    docId: string;
  }) => Promise<DocClock | null>;
  setPeerPulledRemoteClock: (options: {
    id: string;
    peer: string;
    docId: string;
    timestamp: number;
  }) => Promise<void>;
  getBlobUploadedAt: (options: {
    id: string;
    peer: string;
    blobId: string;
  }) => Promise<{ uploadedAt: number | null }>;
  setBlobUploadedAt: (options: {
    id: string;
    peer: string;
    blobId: string;
    uploadedAt: number | null;
  }) => Promise<void>;
  clearClocks: (options: { id: string }) => Promise<void>;
  crawlDocData: (options: {
    id: string;
    docId: string;
  }) => Promise<CrawlResult>;
  indexUpsert: (options: {
    id: string;
    table: string;
    document: NativeIndexDocument;
  }) => Promise<void>;
  indexDelete: (options: {
    id: string;
    table: string;
    docId: string;
  }) => Promise<void>;
  indexSearch: (options: {
    id: string;
    table: string;
    query: NativeIndexQuery;
    options: NativeIndexSearchOptions;
  }) => Promise<NativeIndexSearchResult>;
  indexAggregate: (options: {
    id: string;
    table: string;
    query: NativeIndexQuery;
    field: string;
    limit: number;
    offset: number;
    hits?: NativeIndexSearchOptions;
  }) => Promise<NativeIndexAggregateResult>;
  indexDeleteByQuery: (options: {
    id: string;
    table: string;
    query: NativeIndexQuery;
  }) => Promise<{ deleted: number }>;
  indexFlush: (options: { id: string }) => Promise<void>;
  indexVersion: () => Promise<{ indexVersion: number }>;
  getDocIndexedClock: (options: {
    id: string;
    docId: string;
  }) => Promise<DocIndexedClock | null>;
  setDocIndexedClock: (options: {
    id: string;
    docId: string;
    indexedClock: number;
    indexerVersion: number;
  }) => Promise<void>;
  setDocIndexedClocks: (options: {
    id: string;
    clocks: Array<{ docId: string; timestamp: number; indexerVersion: number }>;
  }) => Promise<void>;
  clearDocIndexedClock: (options: {
    id: string;
    docId: string;
  }) => Promise<void>;
}
