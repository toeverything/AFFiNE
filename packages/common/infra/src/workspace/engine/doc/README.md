# DocEngine

The synchronization algorithm for yjs docs.

```
 ┌─────────┐  ┌───────────┐  ┌────────┐
 │ Storage ◄──┤ DocEngine ├──► Server │
 └─────────┘  └───────────┘  └────────┘
```

# Core Components

## DocStorage

```ts
export interface DocStorage {
  eventBus: DocEventBus;
  doc: ByteKV;
  syncMetadata: ByteKV;
  serverClock: ByteKV;
}
```

Represents the local storage used, Specific implementations are replaceable, such as `IndexedDBDocStorage` on the `browser` and `SqliteDocStorage` on the `desktop`.

### DocEventBus

Each `DocStorage` contains a `DocEventBus`, which is used to communicate with other engines that share the same storage.

With `DocEventBus` we can sync updates between engines without connecting to the server.

For example, on the `browser`, we have multiple tabs, all tabs share the same `IndexedDBDocStorage`, so we use `BroadcastChannel` to implement `DocEventBus`, which allows us to broadcast events to all tabs.

On the `desktop` app, if we have multiple Windows sharing the same `SqliteDocStorage`, we must build a mechanism to broadcast events between all Windows (currently not implemented).

## DocServer

```ts
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

  subscribeAllDocs(cb: (updates: { docId: string; data: Uint8Array; serverClock: number }) => void): Promise<() => void>;

  loadServerClock(after: number): Promise<Map<string, number>>;

  waitForConnectingServer(signal: AbortSignal): Promise<void>;
  disconnectServer(): void;
  onInterrupted(cb: (reason: string) => void): void;
}
```

Represents the server we want to synchronize, there is a simulated implementation in `tests/sync.spec.ts`, and the real implementation is in `packages/backend/server`.

### ServerClock

`ServerClock` is a clock generated after each updates is stored in the Server. It is used to determine the order in which updates are stored in the Server.

The `DocEngine` decides whether to pull updates from the server based on the `ServerClock`.

The `ServerClock` written later must be **greater** than all previously. So on the client side, we can use `loadServerClock(the largest ServerClock previously received)` to obtain all changed `ServerClock`.

## DocEngine

The `DocEngine` is where all the synchronization logic actually happens.

Due to the complexity of the implementation, we divide it into 2 parts.

## DocEngine - LocalPart

Synchronizing **the `YDoc` instance** and **storage**.

The typical workflow is:

1. load data from storage, apply to `YDoc` instance.
2. track `YDoc` changes
3. write the changes back to storage.

### SeqNum

There is a `SeqNum` on each Doc data in `Storage`. Every time `LocalPart` writes data, `SeqNum` will be +1.

There is also a `PushedSeqNum`, which is used for RemotePart later.

## DocEngine - RemotePart

Synchronizing `Storage` and `Server`.

The typical workflow is:

1. Connect with the server, Load `ServerClocks` for all docs, Start subscribing to server-side updates.

2. Check whether each doc requires `push` and `pull`

3. Execute all push and pull

4. Listen for updates from `LocalPart` and push the updates to the server

5. Listen for server-side updates and write them to storage.

### PushedSeqNum

Each Doc will record a `PushedSeqNum`, used to determine whether the doc has unpush updates.

After each `push` is completed, `PushedSeqNum` + 1

If `PushedSeqNum` and `SeqNum` are still different after we complete the push (usually means the previous `push` failed)

Then do a full pull and push and set `pushedSeqNum` = `SeqNum`

### PulledServerClock

Each Doc also record `PulledServerClock`, Used to compare with ServerClock to determine whether to `pull` doc.

When the `pull` is completed, set `PulledServerClock` = `ServerClock` returned by the server.

### Retry

The `RemotePart` may fail at any time, and `RemotePart`'s built-in retry mechanism will restart the process in 5 seconds after failure.
