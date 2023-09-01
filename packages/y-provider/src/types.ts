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

export interface DocState {
  /**
   * The missing structs of client queries with self state.
   */
  missing: Uint8Array;

  /**
   * The full state of remote, used to prepare for diff sync.
   */
  state?: Uint8Array;
}
