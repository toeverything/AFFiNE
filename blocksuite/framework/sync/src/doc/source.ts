export interface DocSource {
  /**
   * for debug
   */
  name: string;

  pull(
    docId: string,
    state: Uint8Array
  ):
    | Promise<{ data: Uint8Array; state?: Uint8Array } | null>
    | { data: Uint8Array; state?: Uint8Array }
    | null;
  finishPull?(docId: string, diffToStorage: Uint8Array): Promise<void> | void;
  push(docId: string, data: Uint8Array): Promise<void> | void;

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
  ): Promise<() => void> | (() => void);
}
