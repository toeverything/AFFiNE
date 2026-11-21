import vm from 'node:vm';

import { expect, test, vitest } from 'vitest';

import { AutoReconnectConnection } from '../connection';
import { BroadcastChannelAwarenessStorage } from '../../impls/broadcast-channel/awareness';
import { type AwarenessRecord } from '../../storage';

test('connect and disconnect', async () => {
  class TestConnection extends AutoReconnectConnection<{
    disconnect: () => void;
  }> {
    connectCount = 0;
    abortCount = 0;
    disconnectCount = 0;
    notListenAbort = false;
    override async doConnect(signal?: AbortSignal) {
      this.connectCount++;
      return new Promise<{ disconnect: () => void }>((resolve, reject) => {
        setTimeout(() => {
          resolve({
            disconnect: () => {
              this.disconnectCount++;
            },
          });
        }, 300);
        if (!this.notListenAbort) {
          signal?.addEventListener('abort', reason => {
            reject(reason);
          });
        }
      }).catch(err => {
        this.abortCount++;
        throw err;
      });
    }
    override doDisconnect(t: { disconnect: () => void }) {
      return t.disconnect();
    }
  }

  const connection = new TestConnection();
  connection.connect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(1);
    expect(connection.disconnectCount).toBe(0);
    expect(connection.abortCount).toBe(0);
    expect(connection.status).toBe('connected');
  });

  connection.disconnect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(1);
    expect(connection.disconnectCount).toBe(1);
    expect(connection.abortCount).toBe(0);
    expect(connection.status).toBe('closed');
  });

  // connect twice
  connection.connect();
  connection.connect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(2);
    expect(connection.disconnectCount).toBe(1);
    expect(connection.abortCount).toBe(0);
    expect(connection.status).toBe('connected');
  });

  connection.disconnect();
  connection.disconnect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(2);
    expect(connection.disconnectCount).toBe(2);
    expect(connection.abortCount).toBe(0);
    expect(connection.status).toBe('closed');
  });

  // calling connect disconnect consecutively, the previous connect call will be aborted.
  connection.connect();
  connection.disconnect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(3);
    expect(connection.disconnectCount).toBe(2);
    expect(connection.abortCount).toBe(1);
    expect(connection.status).toBe('closed');
  });

  connection.connect();
  connection.disconnect();
  connection.connect();
  connection.disconnect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(5);
    expect(connection.disconnectCount).toBe(2);
    expect(connection.abortCount).toBe(3);
    expect(connection.status).toBe('closed');
  });

  // if connection is not listening to abort event, disconnect will be called
  connection.notListenAbort = true;
  connection.connect();
  connection.disconnect();
  connection.connect();
  connection.disconnect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(7);
    expect(connection.disconnectCount).toBe(4);
    expect(connection.abortCount).toBe(3);
    expect(connection.status).toBe('closed');
  });
});

test('retry when connect failed', async () => {
  class TestConnection extends AutoReconnectConnection {
    override retryDelay = 300;
    connectCount = 0;
    retryDelayFor(retryCount: number) {
      return this.getRetryDelay(retryCount);
    }
    override async doConnect() {
      this.connectCount++;
      if (this.connectCount >= 3) {
        return { hello: 'world' };
      }
      throw new Error('not connected, count: ' + this.connectCount);
    }
    override doDisconnect() {
      return Promise.resolve();
    }
    triggerError(error: Error) {
      this.error = error;
    }
  }

  const connection = new TestConnection();
  expect([0, 1, 2, 8].map(count => connection.retryDelayFor(count))).toEqual([
    300, 600, 1200, 60000,
  ]);
  connection.connect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(1);
    expect(connection.status).toBe('error');
    expect(connection.error?.message).toContain('not connected, count: 1');
  });

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(2);
    expect(connection.status).toBe('error');
    expect(connection.error?.message).toBe('not connected, count: 2');
  });

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(3);
    expect(connection.status).toBe('connected');
    expect(connection.error).toBeUndefined();
  });

  connection.triggerError(new Error('disconnected'));
  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(4);
    expect(connection.status).toBe('connected');
  });
});

test('retry when error', async () => {
  class TestConnection extends AutoReconnectConnection {
    override retryDelay = 300;
    connectCount = 0;
    disconnectCount = 0;
    override async doConnect() {
      this.connectCount++;
      return {
        hello: 'world',
      };
    }
    override doDisconnect(conn: any) {
      this.disconnectCount++;
      expect(conn).toEqual({
        hello: 'world',
      });
    }
    triggerError(error: Error) {
      this.error = error;
    }
  }

  const connection = new TestConnection();
  connection.connect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(1);
    expect(connection.status).toBe('connected');
  });

  connection.triggerError(new Error('test error'));

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(1);
    expect(connection.disconnectCount).toBe(1);
    expect(connection.status).toBe('error');
    expect(connection.error?.message).toBe('test error');
  });

  // waitfor reconnect
  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(2);
    expect(connection.disconnectCount).toBe(1);
    expect(connection.status).toBe('connected');
    expect(connection.error).toBeUndefined();
  });

  // do not reconnect if the connection is closed
  connection.disconnect();
  connection.triggerError(new Error('test error2'));
  await new Promise(resolve => setTimeout(resolve, 1000));
  expect(connection.connectCount).toBe(2);
  expect(connection.status).toBe('closed');
});

test('connecting timeout', async () => {
  class TestConnection extends AutoReconnectConnection {
    override connectingTimeout = 150;
    override retryDelay = 150;
    connectCount = 0;
    disconnectCount = 0;
    override async doConnect() {
      this.connectCount++;
      if (this.connectCount === 3) {
        return { foo: 'bar' };
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      throw new Error('not connected, count: ' + this.connectCount);
    }
    override doDisconnect(conn: any) {
      this.disconnectCount++;
      expect(conn).toEqual({
        foo: 'bar',
      });
    }
    triggerError(error: Error) {
      this.error = error;
    }
  }

  const connection = new TestConnection();
  connection.connect();

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(1);
    expect(connection.disconnectCount).toBe(0);
    expect(connection.status).toBe('error');
    expect(connection.error?.message).toBe('connecting timeout');
  });

  // wait for reconnect
  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(2);
    expect(connection.disconnectCount).toBe(0);
    expect(connection.status).toBe('connecting');
    expect(connection.error?.message).toBe('connecting timeout');
  });

  // trigger error while connecting
  connection.triggerError(new Error('test error2'));
  connection.triggerError(new Error('test error2'));

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(2);
    expect(connection.disconnectCount).toBe(0);
    expect(connection.status).toBe('error');
    expect(connection.error?.message).toBe('test error2');
  });

  // wait for reconnect
  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(3);
    expect(connection.disconnectCount).toBe(0);
    expect(connection.status).toBe('connected');
    expect(connection.error).toBeUndefined();
  });

  // trigger error after connected
  connection.triggerError(new Error('test error3'));

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(3);
    expect(connection.disconnectCount).toBe(1); // previous connect is disconnected
    expect(connection.status).toBe('error');
    expect(connection.error?.message).toBe('test error3');
  });

  // reconnect and timeout again
  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(4);
  });
  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(4);
    expect(connection.disconnectCount).toBe(1);
    expect(connection.status).toBe('error');
    expect(connection.error?.message).toBe('connecting timeout');
  });

  await vitest.waitFor(() => {
    expect(connection.connectCount).toBe(5);
  });

  connection.disconnect();

  await new Promise(resolve => setTimeout(resolve, 1000));

  // no reconnect after disconnect
  expect(connection.connectCount).toBe(5);
  expect(connection.status).toBe('closed');
});

test('synchronous connection establishes immediately', () => {
  class SyncTestConnection extends AutoReconnectConnection<{ id: string }> {
    override doConnect() {
      return { id: 'sync-conn' };
    }
    override doDisconnect() {}
  }

  const connection = new SyncTestConnection();
  expect(connection.status).toBe('idle');
  connection.connect();
  expect(connection.status).toBe('connected');
  expect(connection.inner).toEqual({ id: 'sync-conn' });
  connection.disconnect();
  expect(connection.status).toBe('closed');
});

test('cross-realm promise is awaited before becoming connected', async () => {
  const foreignPromise = vm.runInNewContext(
    'Promise.resolve({ id: "cross-realm" })'
  );
  expect(foreignPromise instanceof Promise).toBe(false);

  class CrossRealmConnection extends AutoReconnectConnection<{ id: string }> {
    // No cast required: doConnect is PromiseLike<T> | T
    override doConnect(): PromiseLike<{ id: string }> {
      return foreignPromise;
    }
    override doDisconnect() {}
  }

  const connection = new CrossRealmConnection();
  connection.connect();

  await vitest.waitFor(() => {
    expect(connection.status).toBe('connected');
    expect(connection.inner).toEqual({ id: 'cross-realm' });
  });

  connection.disconnect();
  expect(connection.status).toBe('closed');
});

test('synchronous doConnect throwing sets error status', () => {
  const boom = new Error('sync connect failed');
  class ThrowingConnection extends AutoReconnectConnection<void> {
    override doConnect(): void {
      throw boom;
    }
    override doDisconnect() {}
  }

  const connection = new ThrowingConnection();
  connection.connect();
  expect(connection.status).toBe('error');
  expect(connection.error).toBe(boom);
  connection.disconnect();
});

test('BroadcastChannelAwarenessStorage: subscribeUpdate works immediately after connect', async () => {
  const storage = new BroadcastChannelAwarenessStorage({ id: 'test-workspace' });
  storage.connection.connect();
  // connection must be synchronously connected — no await / microtask needed
  expect(storage.connection.status).toBe('connected');

  const updates: AwarenessRecord[] = [];
  const unsubscribe = storage.subscribeUpdate(
    'test-doc',
    update => updates.push(update),
    () => Promise.resolve(null)
  );

  // BroadcastChannel never delivers a message back to the same channel
  // instance that posted it (Web API spec). Open a peer channel with the
  // same name to simulate a message arriving from another context.
  const peer = new BroadcastChannel(storage.connection.channelName);
  peer.postMessage({
    type: 'awareness-update',
    docId: 'test-doc',
    bin: new Uint8Array([1, 2, 3]),
  });

  // BroadcastChannel message events are delivered asynchronously (queued as
  // tasks), so we must wait for the listener to fire before asserting.
  await vitest.waitFor(() => {
    expect(updates).toHaveLength(1);
  });

  expect(updates[0]).toEqual({
    docId: 'test-doc',
    bin: new Uint8Array([1, 2, 3]),
  });

  unsubscribe();
  peer.close();
  storage.connection.disconnect();
  expect(storage.connection.status).toBe('closed');
});

