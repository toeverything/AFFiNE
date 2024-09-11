export interface DocServer {
  pullDoc(
    docId: string,
    stateVector: Uint8Array
  ): Promise<{
    data: Uint8Array;
    serverClock: number;
    stateVector?: Uint8Array;
  } | null>;

  pushDoc(docId: string, data: Uint8Array): Promise<{ serverClock: number }>;

  loadServerClock(after: number): Promise<Map<string, number>>;

  subscribeAllDocs(
    cb: (updates: {
      docId: string;
      data: Uint8Array;
      serverClock: number;
    }) => void
  ): Promise<() => void>;

  waitForConnectingServer(signal: AbortSignal): Promise<void>;
  disconnectServer(): void;
  onInterrupted(cb: (reason: string) => void): void;

  dispose?(): void;
}
