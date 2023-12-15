export interface SyncStorage {
  /**
   * for debug
   */
  name: string;

  pull(
    docId: string,
    state: Uint8Array
  ): Promise<{ data: Uint8Array; state?: Uint8Array } | null>;
  push(docId: string, data: Uint8Array): Promise<void>;

  /**
   * Subscribe to updates from peer
   *
   * @param cb callback to handle updates
   * @param disconnect callback to handle disconnect, reason can be something like 'network-error'
   *
   * @returns unsubscribe function
   */
  subscribe(
    cb: (docId: string, data: Uint8Array) => void,
    disconnect: (reason: string) => void
  ): Promise<() => void>;
}
