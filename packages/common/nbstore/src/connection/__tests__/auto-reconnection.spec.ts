import { expect, test, vitest } from 'vitest';

import { AutoReconnectConnection } from '../connection';

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
    override async doConnect() {
      this.connectCount++;
      if (this.connectCount === 3) {
        return { hello: 'world' };
      }
      throw new Error('not connected, count: ' + this.connectCount);
    }
    override doDisconnect() {
      return Promise.resolve();
    }
  }

  const connection = new TestConnection();
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
