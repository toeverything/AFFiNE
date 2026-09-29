import { AutoReconnectConnection } from '../../connection';
import type { DocClock, DocUpdate } from '../../storage';
import { type SpaceType, universalId } from '../../utils/universal-id';

export interface DiskSessionOptions {
  workspaceId: string;
  syncFolder: string;
}

export type DiskSyncEvent =
  | { type: 'source-discovered'; docId: string }
  | { type: 'root-doc-discovered'; docId: string }
  | {
      type: 'doc-update';
      update: {
        docId: string;
        bin: Uint8Array;
        timestamp: Date;
        editor?: string;
      };
      origin?: string;
    }
  | { type: 'error'; message: string };

export interface DiskSyncApis {
  startSession: (
    sessionId: string,
    options: DiskSessionOptions
  ) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  applyLocalUpdate: (
    sessionId: string,
    update: DocUpdate
  ) => Promise<
    DocClock & { reviewRequired?: string | null; exportError?: string | null }
  >;
  acknowledgeSourceUpdate: (
    sessionId: string,
    docId: string,
    localSnapshot: Uint8Array
  ) => Promise<void>;
  prepareSourceDoc: (
    sessionId: string,
    docId: string,
    localSnapshot?: Uint8Array,
    localRoot?: Uint8Array
  ) => Promise<Uint8Array | null>;
  subscribeEvents: (
    sessionId: string,
    callback: (event: DiskSyncEvent) => void
  ) => () => void;
}

interface DiskSyncOptions {
  readonly flavour: string;
  readonly type: SpaceType;
  readonly id: string;
  readonly syncFolder: string;
}

let apis: DiskSyncApis | null = null;

export function bindDiskSyncApis(a: DiskSyncApis) {
  apis = a;
}

export class DiskSyncConnection extends AutoReconnectConnection<{
  unsubscribe: () => void;
}> {
  private readonly native: DiskSyncApis;
  readonly sessionId: string;

  readonly flavour = this.options.flavour;
  readonly type = this.options.type;
  readonly id = this.options.id;

  constructor(
    private readonly options: DiskSyncOptions,
    private readonly onEvent: (event: DiskSyncEvent) => void
  ) {
    super();
    if (!apis) {
      throw new Error('Not in native context.');
    }
    this.native = apis;
    this.sessionId = JSON.stringify([
      universalId({ peer: this.flavour, type: this.type, id: this.id }),
      options.syncFolder,
    ]);
  }

  override get shareId(): string {
    return `disk:${this.sessionId}`;
  }

  applyLocalUpdate(update: DocUpdate) {
    return this.native.applyLocalUpdate(this.sessionId, update);
  }

  acknowledgeSourceUpdate(docId: string, localSnapshot: Uint8Array) {
    return this.native.acknowledgeSourceUpdate(
      this.sessionId,
      docId,
      localSnapshot
    );
  }

  prepareSourceDoc(
    docId: string,
    localSnapshot?: Uint8Array,
    localRoot?: Uint8Array
  ) {
    return this.native.prepareSourceDoc(
      this.sessionId,
      docId,
      localSnapshot,
      localRoot
    );
  }

  override async doConnect() {
    const unsubscribe = this.native.subscribeEvents(
      this.sessionId,
      this.onEvent
    );
    try {
      await this.native.startSession(this.sessionId, {
        workspaceId: this.id,
        syncFolder: this.options.syncFolder,
      });
      return { unsubscribe };
    } catch (error) {
      unsubscribe();
      throw error;
    }
  }

  override doDisconnect(conn: { unsubscribe: () => void }) {
    try {
      conn.unsubscribe();
    } catch (error) {
      console.error('DiskSyncConnection unsubscribe failed', error);
    }
    this.native.stopSession(this.sessionId).catch(error => {
      console.error('DiskSyncConnection stopSession failed', error);
    });
  }
}
