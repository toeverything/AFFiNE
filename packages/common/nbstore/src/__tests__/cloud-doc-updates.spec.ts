import { describe, expect, test, vi } from 'vitest';
import {
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

import { CloudAwarenessStorage } from '../impls/cloud/awareness';
import { CloudDocStorage } from '../impls/cloud/doc';
import { createIdConverter } from '../utils/id-converter';

const base64UpdateA = 'AQID';
const base64UpdateB = 'BAUG';

class FakeSocket {
  connected = true;
  workspaceSyncActive = true;
  protocolVersion = 2;
  rootUpdate = 'AAA=';
  readonly joinedDocs = new Set<string>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  readonly handlers = new Map<string, (...args: unknown[]) => void>();

  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, handler: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(handler);
    this.listeners.set(event, listeners);
    this.handlers.set(event, handler);
    return this;
  }

  once(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }

  off(event: string, handler?: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? [];
    if (handler) {
      const index = listeners.lastIndexOf(handler);
      if (index !== -1) listeners.splice(index, 1);
    } else listeners.length = 0;
    const last = listeners.at(-1);
    if (last) this.handlers.set(event, last);
    else this.handlers.delete(event);
    return this;
  }

  emitServer(event: string, payload: unknown) {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return true;
  }

  async emitWithAck(
    event: string,
    payload: {
      docId?: string;
      spaces?: { docId?: string }[];
      intent?: 'create' | 'update';
      protocolVersion?: number;
    }
  ) {
    this.emitted.push({ event, payload });
    if (event === 'space:join-batch') {
      this.protocolVersion = payload.protocolVersion ?? 2;
      if (!this.workspaceSyncActive) {
        return {
          error: {
            name: 'WORKSPACE_SYNC_UNAVAILABLE',
            message: 'Workspace sync is not active',
          },
        };
      }
      for (const space of payload.spaces ?? []) {
        if (space.docId === 'denied') {
          return { error: { name: 'DOC_ACTION_DENIED', message: 'denied' } };
        }
        if (space.docId) this.joinedDocs.add(space.docId);
      }
    }
    if (event === 'space:load-doc' || event === 'space:push-doc-update') {
      if (
        event === 'space:load-doc' ||
        (this.protocolVersion === 2 && payload.intent !== 'create')
      )
        expect(this.joinedDocs.has(payload.docId!)).toBe(true);
      return {
        data: {
          missing: payload.docId === 'space-1' ? this.rootUpdate : 'AAA=',
          state: 'AA==',
          timestamp: 1_000,
          accepted: true,
          created: payload.intent === 'create',
        },
      };
    }
    if (event === 'space:doc-lifecycle') {
      return { data: { timestamp: 1_000 } };
    }
    if (event === 'space:load-workspace-state')
      return {
        data: {
          docs: [
            {
              docId: 'doc-1',
              timestamp: 1000,
              lifecycle: 'trashed',
              lifecycleChangedAt: 1200,
            },
          ],
          clocks: { 'space-1': 900 },
        },
      };
    return {
      data: {
        clientId: 'client-1',
        success: true,
        protocolVersion: this.protocolVersion,
      },
    };
  }
}

describe('CloudDocStorage broadcast updates', () => {
  test.each([1, 2] as const)(
    'protocol %s accepts updates and clocks from its physical document route',
    async protocolVersion => {
      const storage = new CloudDocStorage({
        protocolVersion,
        accountId: 'account-1',
        id: 'space-1',
        serverBaseUrl: 'http://localhost',
        isSelfHosted: true,
        type: 'workspace',
        readonlyMode: true,
      });

      storage.connection.idConverter = createIdConverter(
        'space-1',
        protocolVersion === 1
          ? new Map([['legacy-doc-1', 'doc-1']])
          : undefined,
        protocolVersion === 1 ? new Map([['doc-1', 'legacy-doc-1']]) : undefined
      );

      const received: Uint8Array[] = [];
      storage.subscribeDocUpdate(update => {
        received.push(update.bin);
      });

      storage.onServerUpdates({
        spaceType: 'workspace',
        spaceId: 'space-1',
        docId: protocolVersion === 1 ? 'legacy-doc-1' : 'doc-1',
        updates: [base64UpdateA, base64UpdateB],
        timestamp: 1000,
      });

      if (protocolVersion === 1) {
        storage.onServerUpdates({
          spaceType: 'workspace',
          spaceId: 'space-1',
          docId: 'doc-1',
          updates: [base64UpdateA],
          timestamp: 10_000,
        });
      }

      expect(received).toEqual([
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
      ]);
      const emitWithAck = vi.fn();
      Object.defineProperty(storage, 'socket', { value: { emitWithAck } });
      for (const entries of [
        [
          ['legacy-doc-1', 1000],
          ['doc-1', 2000],
        ],
        [
          ['doc-1', 2000],
          ['legacy-doc-1', 1000],
        ],
      ]) {
        emitWithAck.mockResolvedValueOnce({
          data: Object.fromEntries(entries),
        });
        expect(await storage.getDocTimestamps()).toEqual(
          protocolVersion === 1
            ? { 'doc-1': new Date(1000) }
            : { 'doc-1': new Date(2000), 'legacy-doc-1': new Date(1000) }
        );
      }
      const selectedId = storage.idConverter.newIdToOldId('doc-1');
      emitWithAck.mockRejectedValueOnce(new Error('ACK lost'));
      await expect(
        storage.applyDocLifecycle('doc-1', 'delete')
      ).rejects.toThrow('ACK lost');
      storage.connection.idConverter = createIdConverter('space-1');
      emitWithAck.mockResolvedValueOnce({
        data: { timestamp: 2000, deletedDocIds: ['doc-1', selectedId] },
      });
      const deletion = await storage.applyDocLifecycle('doc-1', 'delete');
      expect(deletion.deletedDocIds).toEqual(['doc-1', selectedId]);
      expect(
        emitWithAck.mock.calls.slice(-2).map(([, request]) => request)
      ).toEqual([
        {
          spaceType: 'workspace',
          spaceId: 'space-1',
          docId: 'doc-1',
          physicalDocId: selectedId,
          lifecycle: 'delete',
        },
        {
          spaceType: 'workspace',
          spaceId: 'space-1',
          docId: 'doc-1',
          physicalDocId: selectedId,
          lifecycle: 'delete',
        },
      ]);
      emitWithAck.mockResolvedValueOnce({
        error: { name: 'DOC_ACTION_DENIED', message: 'denied' },
      });
      await expect(
        storage.applyDocLifecycle('doc-1', 'delete')
      ).rejects.toMatchObject({ name: 'DOC_ACTION_DENIED' });
      storage.connection.idConverter = createIdConverter(
        'space-1',
        new Map([['new-body', 'doc-1']]),
        new Map([['doc-1', 'new-body']])
      );
      emitWithAck.mockResolvedValueOnce({
        error: { name: 'INTERNAL_SERVER_ERROR', message: 'uncertain' },
      });
      await expect(
        storage.applyDocLifecycle('doc-1', 'delete')
      ).rejects.toMatchObject({ name: 'INTERNAL_SERVER_ERROR' });
      expect(emitWithAck.mock.lastCall?.[1].physicalDocId).toBe('new-body');
      storage.connection.idConverter = createIdConverter('space-1');
      emitWithAck.mockResolvedValueOnce({
        data: { timestamp: 2000, deletedDocIds: ['doc-1', 'new-body'] },
      });
      await storage.applyDocLifecycle('doc-1', 'delete');
      expect(emitWithAck.mock.lastCall?.[1].physicalDocId).toBe('new-body');
      storage.connection.idConverter = createIdConverter(
        'space-1',
        new Map([[selectedId, 'doc-1']]),
        new Map([['doc-1', selectedId]])
      );
      vi.useFakeTimers();
      try {
        emitWithAck.mockResolvedValueOnce({
          data: { [protocolVersion === 1 ? 'legacy-doc-1' : 'doc-1']: 1500 },
        });
        storage.onServerInvalidation({
          spaceType: 'workspace',
          spaceId: 'space-1',
          timestamp: 1500,
        });
        await vi.advanceTimersByTimeAsync(50);
        expect(received).toHaveLength(3);
        expect(received[2]).toEqual(new Uint8Array());
      } finally {
        vi.useRealTimers();
      }
    }
  );

  test('repairs strict invalidation through readable timestamps', async () => {
    vi.useFakeTimers();
    try {
      const storage = new CloudDocStorage({
        protocolVersion: 2,
        accountId: 'account-1',
        id: 'space-1',
        serverBaseUrl: 'http://localhost',
        isSelfHosted: true,
        type: 'workspace',
        readonlyMode: true,
      });

      storage.connection.idConverter = {
        oldIdToNewId: (id: string) => id,
        newIdToOldId: (id: string) => id,
      };

      const getDocTimestamps = vi
        .spyOn(storage, 'getDocTimestamps')
        .mockResolvedValue({ 'doc-a': new Date(1_000) });
      const received: Array<{ docId: string; bin: Uint8Array }> = [];
      storage.subscribeDocUpdate(update => {
        received.push({ docId: update.docId, bin: update.bin });
      });

      storage.onServerInvalidation({
        spaceType: 'workspace',
        spaceId: 'space-1',
        timestamp: 1_000,
      });
      storage.onServerInvalidation({
        spaceType: 'workspace',
        spaceId: 'space-1',
        timestamp: 1_001,
      });

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(20);
        storage.onServerInvalidation({
          spaceType: 'workspace',
          spaceId: 'space-1',
          timestamp: 1_002 + i,
        });
      }
      expect(received).toHaveLength(1);
      expect(getDocTimestamps).toHaveBeenCalledOnce();
      expect(received[0]).toMatchObject({ docId: 'doc-a' });
      expect(received[0]?.bin).toEqual(new Uint8Array());
      const inventoryChanged = vi.fn();
      const unsubscribe =
        storage.subscribeWorkspaceStateInvalidation(inventoryChanged);
      storage.onServerInvalidation({
        spaceType: 'workspace',
        spaceId: 'space-1',
        inventoryChanged: true,
      });
      expect(inventoryChanged).toHaveBeenCalledOnce();
      expect(getDocTimestamps).toHaveBeenCalledOnce();
      unsubscribe();
      await vi.advanceTimersByTimeAsync(50);
      expect(getDocTimestamps).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([1, 2] as const)(
    'protocol %s batch route joins the workspace and applies its document contract',
    async protocolVersion => {
      vi.stubGlobal('BUILD_CONFIG', { appVersion: '0.27.5' });
      const fakeSocket = new FakeSocket();
      const root = new YDoc();
      const pages = new YArray();
      root.getMap('meta').set('pages', pages);
      pages.push([new YMap([['id', 'doc-1']])]);
      root.getMap('spaces').set('doc-1', new YDoc({ guid: 'legacy-doc-1' }));
      fakeSocket.rootUpdate = Buffer.from(encodeStateAsUpdate(root)).toString(
        'base64'
      );
      root.destroy();
      const disconnect = vi.fn();
      const storage = new CloudDocStorage({
        protocolVersion,
        accountId: 'account-1',
        id: 'space-1',
        serverBaseUrl: 'http://localhost',
        isSelfHosted: true,
        type: 'workspace',
        readonlyMode: true,
      });
      const connection = storage.connection;

      Object.defineProperty(connection, 'manager', {
        configurable: true,
        value: {
          connect: () => ({ socket: fakeSocket, disconnect }),
        },
      });
      const inner = await connection.doConnect();
      Object.defineProperty(connection, '_inner', { value: inner });
      await storage.getDocSnapshot('doc-1');
      await storage.getDocDiff('doc-2');
      await storage.getDocTimestamp('doc-3');
      await storage.pushDocUpdate({
        docId: 'doc-4',
        bin: new Uint8Array([0, 0]),
      });
      await storage.pushDocUpdate({
        docId: 'new-doc',
        bin: new Uint8Array([0, 0]),
        intent: 'create',
      });
      expect(fakeSocket.joinedDocs.has('new-doc')).toBe(false);
      expect(
        fakeSocket.emitted
          .filter(entry => entry.event === 'space:push-doc-update')
          .map(entry => entry.payload)
      ).toEqual([
        expect.objectContaining({
          docId: 'doc-4',
          intent: protocolVersion === 1 ? 'create' : 'update',
        }),
        expect.objectContaining({ docId: 'new-doc', intent: 'create' }),
      ]);
      expect(await storage.getWorkspaceState()).toEqual({
        docs: [
          {
            docId: 'doc-1',
            timestamp: 1000,
            lifecycle: 'trashed',
            lifecycleChangedAt: 1200,
          },
        ],
        clocks: { 'space-1': 900 },
      });
      const lifecycle =
        protocolVersion === 2
          ? await storage.applyDocLifecycle('doc-1', 'trash')
          : undefined;
      expect(!!storage.workspaceStateScope).toBe(protocolVersion === 2);
      expect(storage.idConverter.newIdToOldId('doc-1')).toBe(
        protocolVersion === 1 ? 'legacy-doc-1' : 'doc-1'
      );
      await expect(storage.getDocSnapshot('denied')).rejects.toMatchObject({
        name: 'DOC_ACTION_DENIED',
      });
      fakeSocket.joinedDocs.delete('doc-1');
      await storage.getDocDiff('doc-1');
      connection.doDisconnect(inner);
      expect({ emitted: fakeSocket.emitted, lifecycle }).toMatchSnapshot(
        lifecycle ? { lifecycle: { timestamp: expect.any(Date) } } : {}
      );

      expect(disconnect).toHaveBeenCalledOnce();
      vi.unstubAllGlobals();
    }
  );

  test('awareness joins active documents through the batch route', async () => {
    vi.stubGlobal('BUILD_CONFIG', { appVersion: '0.27.5' });
    const fakeSocket = new FakeSocket();
    const storage = new CloudAwarenessStorage({
      protocolVersion: 2,
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
    });

    const docStorage = new CloudDocStorage({
      accountId: 'account-1',
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
    });
    docStorage.connection.idConverter = createIdConverter(
      'space-1',
      new Map([['legacy-a', 'doc-a']]),
      new Map([['doc-a', 'legacy-a']])
    );
    vi.spyOn(docStorage.connection, 'waitForConnected').mockResolvedValue(
      undefined
    );
    storage.bindDocStorage(docStorage);

    Object.defineProperty(storage, 'connection', {
      configurable: true,
      value: {
        status: 'connected',
        inner: { socket: fakeSocket },
        onStatusChanged: () => () => {},
      },
    });

    const unsubscribeA = storage.subscribeUpdate(
      'doc-a',
      () => {},
      async () => null
    );
    const unsubscribeB = storage.subscribeUpdate(
      'doc-b',
      () => {},
      async () => null
    );

    await vi.waitFor(() => {
      expect(
        fakeSocket.emitted.filter(
          ({ event: emittedEvent }) => emittedEvent === 'space:join-batch'
        )
      ).toHaveLength(1);
    });

    expect(fakeSocket.emitted).toMatchSnapshot();

    unsubscribeA();
    unsubscribeB();

    vi.useFakeTimers();
    const recoverySocket = new FakeSocket();
    recoverySocket.workspaceSyncActive = false;
    const recovery = new CloudAwarenessStorage({
      protocolVersion: 2,
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
    });
    const disconnect = vi.fn();
    const connect = vi.fn(() => ({ socket: recoverySocket, disconnect }));
    Object.defineProperty(recovery.connection, 'manager', {
      value: { connect },
    });
    recovery.connection.retryDelay = 10;
    const collect = vi.fn(async () => null);
    const updates = vi.fn();
    const joinCount = () =>
      recoverySocket.emitted.filter(({ event }) => event === 'space:join-batch')
        .length;
    const collectCount = () =>
      recoverySocket.emitted.filter(
        ({ event }) => event === 'space:load-awarenesses'
      ).length;
    const docIds = Array.from({ length: 103 }, (_, index) => `doc-${index}`);
    const unsubscribes: Array<() => void> = [];
    try {
      recovery.connection.connect();
      await vi.advanceTimersByTimeAsync(0);
      for (const docId of docIds) {
        unsubscribes.push(recovery.subscribeUpdate(docId, updates, collect));
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('error');
      expect(recovery.connection.error?.name).toBe(
        'WORKSPACE_SYNC_UNAVAILABLE'
      );
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(joinCount()).toBe(1);
      expect(collectCount()).toBe(0);
      expect(
        recoverySocket.listeners.get('space:collect-awareness')
      ).toHaveLength(0);
      const leaveTemporary = recovery.subscribeUpdate(
        'temporary',
        updates,
        collect
      );
      expect(() => leaveTemporary()).not.toThrow();

      await vi.advanceTimersByTimeAsync(10);
      expect(joinCount()).toBe(2);
      expect(disconnect).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(19);
      expect(joinCount()).toBe(2);
      recoverySocket.workspaceSyncActive = true;
      await vi.advanceTimersByTimeAsync(1);
      expect(connect).toHaveBeenCalledTimes(3);
      expect(recovery.connection.status).toBe('connected');
      expect(joinCount()).toBe(5);
      expect(collectCount()).toBe(103);
      expect([...recoverySocket.joinedDocs].sort()).toEqual([...docIds].sort());
      expect(
        recoverySocket.listeners.get('space:collect-awareness')
      ).toHaveLength(103);
      expect(
        recoverySocket.listeners.get('space:broadcast-awareness-update')
      ).toHaveLength(103);
      recoverySocket.emitServer('space:collect-awareness', {
        spaceType: 'workspace',
        spaceId: 'space-1',
        docId: 'doc-0',
      });
      recoverySocket.emitServer('space:broadcast-awareness-update', {
        spaceType: 'workspace',
        spaceId: 'space-1',
        docId: 'doc-0',
        awarenessUpdate: base64UpdateA,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(collect).toHaveBeenCalledTimes(1);
      expect(updates).toHaveBeenCalledTimes(1);
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
      expect(
        recoverySocket.listeners.get('space:collect-awareness')
      ).toHaveLength(0);
      expect(
        recoverySocket.listeners.get('space:broadcast-awareness-update')
      ).toHaveLength(0);
      const leaveDenied = recovery.subscribeUpdate('denied', updates, collect);
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('connected');
      expect(connect).toHaveBeenCalledTimes(3);
      leaveDenied();
      recoverySocket.workspaceSyncActive = false;
      const leaveStopped = recovery.subscribeUpdate(
        'stopped',
        updates,
        collect
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('error');
      recoverySocket.workspaceSyncActive = true;
      let finishJoin: (() => void) | undefined;
      const emitWithAck = recoverySocket.emitWithAck.bind(recoverySocket);
      vi.spyOn(recoverySocket, 'emitWithAck').mockImplementationOnce(
        async (event, payload) => {
          const response = await emitWithAck(event, payload);
          await new Promise<void>(resolve => {
            finishJoin = resolve;
          });
          return response;
        }
      );
      await vi.advanceTimersByTimeAsync(10);
      expect(recovery.connection.status).toBe('connecting');
      expect(finishJoin).toBeDefined();
      expect(() => leaveStopped()).not.toThrow();
      finishJoin?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('connected');
      expect(recoverySocket.emitted.at(-1)).toEqual({
        event: 'space:join-batch',
        payload: {
          spaces: [{ spaceType: 'workspace', spaceId: 'space-1' }],
          clientVersion: '0.27.5',
          protocolVersion: 2,
        },
      });
      expect(recoverySocket.joinedDocs.has('stopped')).toBe(false);
      recoverySocket.workspaceSyncActive = false;
      const leaveIdle = recovery.subscribeUpdate('idle', updates, collect);
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('error');
      leaveIdle();
      const joinsBeforeIdleRetry = joinCount();
      await vi.advanceTimersByTimeAsync(10);
      expect(recovery.connection.status).toBe('connected');
      expect(joinCount()).toBe(joinsBeforeIdleRetry);
      recovery.connection.disconnect();
      const joinsBeforeStop = joinCount();
      await vi.advanceTimersByTimeAsync(100);
      expect(joinCount()).toBe(joinsBeforeStop);
      expect(collectCount()).toBe(103);
      expect(recovery.connection.status).toBe('closed');
    } finally {
      for (const unsubscribe of unsubscribes) unsubscribe();
      recovery.connection.disconnect();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
