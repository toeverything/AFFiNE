import { beforeEach, describe, expect, test, vi } from 'vitest';

import { WorkerOpRenderer } from './worker-op-renderer';

vi.mock('@affine/env/worker', () => ({
  getWorkerUrl: vi.fn(() => '/worker.js'),
}));

class MockWorker {
  addEventListener = vi.fn();
  postMessage = vi.fn();
  removeEventListener = vi.fn();
  terminate = vi.fn();
}

class TestRenderer extends WorkerOpRenderer<{
  init: [undefined, { ok: true }];
}> {
  constructor() {
    super('test');
  }

  init() {
    return this.ensureInitialized(async () => {
      return { ok: true } as const;
    });
  }
}

describe('WorkerOpRenderer', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', MockWorker);
  });

  test('rejects initialization after destroy', async () => {
    const renderer = new TestRenderer();

    renderer.destroy();

    await expect(renderer.init()).rejects.toThrow('renderer destroyed');
  });
});
