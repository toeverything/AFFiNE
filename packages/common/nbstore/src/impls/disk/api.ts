import { AutoReconnectConnection } from '../../connection';
import type { DocClock, DocUpdate } from '../../storage';
import { type SpaceType, universalId } from '../../utils/universal-id';

export interface DiskSessionOptions {
  workspaceId: string;
  syncFolder: string;
}

export type DiskSyncEvent =
  | { type: 'ready' }
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
  | { type: 'doc-delete'; docId: string; timestamp: Date }
  | { type: 'error'; message: string };

export interface DiskSyncApis {
  startSession: (
    sessionId: string,
    options: DiskSessionOptions
  ) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  applyLocalUpdate: (
    sessionId: string,
    update: DocUpdate,
    origin?: string
  ) => Promise<DocClock>;
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

interface DiskSyncApisWrapper {
  startSession: (options: DiskSessionOptions) => Promise<void>;
  stopSession: () => Promise<void>;
  applyLocalUpdate: (update: DocUpdate, origin?: string) => Promise<DocClock>;
  subscribeEvents: (callback: (event: DiskSyncEvent) => void) => () => void;
}

let apis: DiskSyncApis | null = null;

export function bindDiskSyncApis(a: DiskSyncApis) {
  apis = a;
}

export class DiskSyncConnection extends AutoReconnectConnection<{
  unsubscribe: () => void;
}> {
  readonly apis: DiskSyncApisWrapper;
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
    this.sessionId = universalId({
      peer: this.flavour,
      type: this.type,
      id: this.id,
    });
    this.apis = this.wrapApis(apis);
  }

  override get shareId(): string {
    return `disk:${this.sessionId}:${this.options.syncFolder}`;
  }

  private wrapApis(originalApis: DiskSyncApis): DiskSyncApisWrapper {
    const sessionId = this.sessionId;
    return new Proxy(
      {},
      {
        get: (_target, key: keyof DiskSyncApisWrapper) => {
          const method = originalApis[key];
          return (...args: unknown[]) => {
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            return (method as any)(sessionId, ...args);
          };
        },
      }
    ) as DiskSyncApisWrapper;
  }

  override async doConnect() {
    await this.apis.startSession({
      workspaceId: this.id,
      syncFolder: this.options.syncFolder,
    });
    const unsubscribe = this.apis.subscribeEvents(this.onEvent);
    return { unsubscribe };
  }

  override doDisconnect(conn: { unsubscribe: () => void }) {
    try {
      conn.unsubscribe();
    } catch (error) {
      console.error('DiskSyncConnection unsubscribe failed', error);
    }
    this.apis.stopSession().catch(error => {
      console.error('DiskSyncConnection stopSession failed', error);
    });
  }
}
