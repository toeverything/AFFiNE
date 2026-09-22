import { describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  providedMeta: vi.fn(),
  previewHandlers: {
    renderMermaidSvg: vi.fn(),
    renderTypstSvg: vi.fn(),
  },
}));

vi.mock('../../src/helper/dialog', () => ({ dialogHandlers: {} }));
vi.mock('../../src/helper/disk-sync', () => ({
  diskSyncEvents: {},
  diskSyncHandlers: {},
}));
vi.mock('../../src/helper/nbstore', () => ({
  dbEventsV1: {},
  dbHandlersV1: {},
  nbstoreHandlers: {},
}));
vi.mock('../../src/helper/preview', () => ({
  previewHandlers: fixtures.previewHandlers,
}));
vi.mock('../../src/helper/provide', () => ({
  provideExposed: fixtures.providedMeta,
}));
vi.mock('../../src/helper/workspace', () => ({
  workspaceEvents: {},
  workspaceHandlers: {},
}));

describe('helper exposure metadata', () => {
  it('exposes the preview handler namespace to the preload bridge', async () => {
    await import('../../src/helper/exposed');

    expect(fixtures.providedMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        handlers: expect.arrayContaining([
          ['preview', ['renderMermaidSvg', 'renderTypstSvg']],
        ]),
      })
    );
  });
});
