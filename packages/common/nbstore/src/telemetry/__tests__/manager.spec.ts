import 'fake-indexeddb/auto';

import { expect, test, vi } from 'vitest';

import { TelemetryManager } from '../manager';
import type { TelemetryContext, TelemetryEvent } from '../types';

const context: TelemetryContext = {
  isAuthed: false,
  isSelfHosted: false,
  channel: 'stable',
  officialEndpoint: 'https://example.com',
};

const baseEvent: TelemetryEvent = {
  schemaVersion: 1,
  eventName: 'openDoc',
  clientId: 'client-1',
  eventId: 'event-1',
};

test('telemetry manager retries with backoff and flushes on success', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'fail',
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, accepted: 1, dropped: 0 }),
    });

  globalThis.fetch = fetchMock as any;
  (globalThis as any).BUILD_CONFIG = { appVersion: 'test' };

  const manager = new TelemetryManager({
    retryBaseMs: 10,
    retryMaxMs: 10,
    maxBatchEvents: 5,
  });
  await manager.setContext(context);

  await manager.track(baseEvent);
  const first = await manager.flush();
  expect(first.ok).toBe(false);
  expect(manager.getQueueState().size).toBe(1);
  expect(manager.getQueueState().nextRetryAt).toBeDefined();

  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(manager.getQueueState().size).toBe(0);
  });
});

test('telemetry queue caps entries and drops oldest', async () => {
  (globalThis as any).BUILD_CONFIG = { appVersion: 'test' };
  globalThis.fetch = vi.fn() as any;

  const manager = new TelemetryManager({
    maxQueueEntries: 2,
    maxQueueBytes: 10_000,
  });
  await manager.setContext({
    ...context,
    officialEndpoint: '',
  });

  await manager.track({ ...baseEvent, eventId: 'event-1' });
  await manager.track({ ...baseEvent, eventId: 'event-2' });
  await manager.track({ ...baseEvent, eventId: 'event-3' });

  expect(manager.getQueueState().size).toBe(2);
});
