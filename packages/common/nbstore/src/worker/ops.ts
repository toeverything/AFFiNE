import type { AvailableStorageImplementations } from '../impls';
import type {
  AggregateResult,
  BlobRecord,
  DocClock,
  DocClocks,
  DocDiff,
  DocRecord,
  DocUpdate,
  ListedBlobRecord,
  Query,
  SearchResult,
  StorageType,
} from '../storage';
import type { AwarenessRecord } from '../storage/awareness';
import type { BlobSyncBlobState, BlobSyncState } from '../sync/blob';
import type { DocSyncDocState, DocSyncState } from '../sync/doc';
import type { IndexerDocSyncState, IndexerSyncState } from '../sync/indexer';
import type {
  TelemetryAck,
  TelemetryContext,
  TelemetryEvent,
  TelemetryQueueState,
} from '../telemetry/types';

type StorageInitOptions = Values<{
  [key in keyof AvailableStorageImplementations]: {
    name: key;
    opts: ConstructorParameters<AvailableStorageImplementations[key]>[0];
  };
}>;

export interface StoreInitOptions {
  local: { [key in StorageType]?: StorageInitOptions };
  remotes: Record<string, { [key in StorageType]?: StorageInitOptions }>;
}

interface GroupedWorkerOps {
  docStorage: {
    getDoc: [string, DocRecord | null];
    getDocDiff: [{ docId: string; state?: Uint8Array }, DocDiff | null];
    pushDocUpdate: [{ update: DocUpdate; origin?: string }, DocClock];
    getDocTimestamps: [Date | null, DocClocks];
    getDocTimestamp: [string, DocClock | null];
    deleteDoc: [string, void];
    subscribeDocUpdate: [void, { update: DocRecord; origin?: string }];
    waitForConnected: [void, void];
  };

  blobStorage: {
    getBlob: [string, BlobRecord | null];
    setBlob: [BlobRecord, void];
    deleteBlob: [{ key: string; permanently: boolean }, void];
    releaseBlobs: [void, void];
    listBlobs: [void, ListedBlobRecord[]];
    waitForConnected: [void, void];
  };

  awarenessStorage: {
    update: [{ awareness: AwarenessRecord; origin?: string }, void];
    subscribeUpdate: [
      string,
      (
        | {
            type: 'awareness-update';
            awareness: AwarenessRecord;
            origin?: string;
          }
        | { type: 'awareness-collect'; collectId: string }
      ),
    ];
    collect: [{ collectId: string; awareness: AwarenessRecord }, void];
    waitForConnected: [void, void];
  };

  docSync: {
    state: [void, DocSyncState];
    docState: [string, DocSyncDocState];
    waitForSynced: [string | null, void];
    addPriority: [{ docId: string; priority: number }, boolean];
    resetSync: [void, void];
  };

  blobSync: {
    state: [void, BlobSyncState];
    blobState: [string, BlobSyncBlobState];
    downloadBlob: [string, boolean];
    uploadBlob: [{ blob: BlobRecord; force?: boolean }, true];
    fullDownload: [string | null, void];
  };

  awarenessSync: {
    update: [{ awareness: AwarenessRecord; origin?: string }, void];
    subscribeUpdate: [
      string,
      (
        | {
            type: 'awareness-update';
            awareness: AwarenessRecord;
            origin?: string;
          }
        | { type: 'awareness-collect'; collectId: string }
      ),
    ];
    collect: [{ collectId: string; awareness: AwarenessRecord }, void];
  };

  indexerSync: {
    state: [void, IndexerSyncState];
    docState: [string, IndexerDocSyncState];
    addPriority: [{ docId: string; priority: number }, boolean];
    waitForCompleted: [void, void];
    waitForDocCompleted: [string, void];
    search: [
      {
        table: string;
        query: Query<any>;
        options?: any;
      },
      SearchResult<any, any>,
    ];
    aggregate: [
      {
        table: string;
        query: Query<any>;
        field: string;
        options?: any;
      },
      AggregateResult<any, any>,
    ];
    subscribeSearch: [
      {
        table: string;
        query: Query<any>;
        options?: any;
      },
      SearchResult<any, any>,
    ];
    subscribeAggregate: [
      {
        table: string;
        query: Query<any>;
        field: string;
        options?: any;
      },
      AggregateResult<any, any>,
    ];
  };
  sync: {
    enableBatterySaveMode: [void, void];
    disableBatterySaveMode: [void, void];
    pauseSync: [void, void];
    resumeSync: [void, void];
  };
}

type Values<T> = T extends { [k in keyof T]: any } ? T[keyof T] : never;
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

export type WorkerOps = UnionToIntersection<
  Values<
    Values<{
      [k in keyof GroupedWorkerOps]: {
        [k2 in keyof GroupedWorkerOps[k]]: k2 extends string
          ? Record<`${k}.${k2}`, GroupedWorkerOps[k][k2]>
          : never;
      };
    }>
  >
>;

export type WorkerManagerOps = {
  open: [
    {
      port: MessagePort;
      key: string;
      closeKey: string;
      options: StoreInitOptions;
    },
    string,
  ];
  close: [string, void];
  'telemetry.setContext': [TelemetryContext, void];
  'telemetry.track': [TelemetryEvent, { queued: boolean }];
  'telemetry.pageview': [TelemetryEvent, { queued: boolean }];
  'telemetry.flush': [void, TelemetryAck];
  'telemetry.getQueueState': [void, TelemetryQueueState];
};
