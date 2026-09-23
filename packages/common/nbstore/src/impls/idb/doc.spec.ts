import 'fake-indexeddb/auto';

import { afterEach, expect, test, vi } from 'vitest';

import { IndexedDBDocStorage } from './doc';

afterEach(() => {
  vi.useRealTimers();
});

test('retries update timestamp collisions without leaking transaction errors', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-05T00:00:00.000Z'));

  const storage = new IndexedDBDocStorage({
    id: 'idb-doc-timestamp-collision',
    flavour: 'local',
    type: 'workspace',
  });
  storage.connection.connect();
  await storage.connection.waitForConnected();

  const first = await storage.pushDocUpdate({
    docId: 'doc-1',
    bin: new Uint8Array([1]),
  });
  const second = await storage.pushDocUpdate({
    docId: 'doc-1',
    bin: new Uint8Array([2]),
  });

  expect(second.timestamp.getTime()).toBe(first.timestamp.getTime() + 1);

  storage.connection.disconnect();
});
