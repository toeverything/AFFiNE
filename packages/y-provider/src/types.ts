export type Status =
  | {
      type: 'idle';
    }
  | {
      type: 'syncing';
    }
  | {
      type: 'synced';
    }
  | {
      type: 'error';
      error: Error;
    };

export interface StatusAdapter {
  readonly status: Status;
  subscribeStatusChange(onStatusChange: () => void): () => void;
}

export interface DatasourceDocAdapter extends Partial<StatusAdapter> {
  // request diff update from other clients
  queryDocState: (
    guid: string,
    options?: {
      stateVector?: Uint8Array;
      targetClientId?: number;
    }
  ) => Promise<Uint8Array | false>;

  // send update to the datasource
  sendDocUpdate: (guid: string, update: Uint8Array) => Promise<void>;

  // listen to update from the datasource. Returns a function to unsubscribe.
  // this is optional because some datasource might not support it
  onDocUpdate?(
    callback: (guid: string, update: Uint8Array) => void
  ): () => void;
}
