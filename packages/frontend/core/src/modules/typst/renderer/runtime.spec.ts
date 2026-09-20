import { beforeEach, describe, expect, test, vi } from 'vitest';

const { loadFonts, setCompilerInitOptions, setRendererInitOptions, svg } =
  vi.hoisted(() => ({
    loadFonts: vi.fn((fontUrls: string[]) => ({ fontUrls })),
    setCompilerInitOptions: vi.fn(),
    setRendererInitOptions: vi.fn(),
    svg: vi.fn(),
  }));

vi.mock('@myriaddreamin/typst.ts', () => ({
  $typst: {
    setCompilerInitOptions,
    setRendererInitOptions,
    svg,
  },
  loadFonts,
}));

import { ensureTypstReady, renderTypstSvgWithOptions } from './runtime';

describe('typst runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svg.mockResolvedValue('<svg />');
  });

  test('reconfigures typst when fontUrls change', async () => {
    await ensureTypstReady(['font-a']);
    await ensureTypstReady(['font-b']);

    expect(loadFonts).toHaveBeenNthCalledWith(
      1,
      ['font-a'],
      expect.any(Object)
    );
    expect(loadFonts).toHaveBeenNthCalledWith(
      2,
      ['font-b'],
      expect.any(Object)
    );
    expect(setCompilerInitOptions).toHaveBeenCalledTimes(2);
    expect(setRendererInitOptions).toHaveBeenCalledTimes(2);
  });

  test('serializes typst renders that need different configuration', async () => {
    const events: string[] = [];
    let releaseFirstRender!: () => void;

    svg.mockImplementationOnce(async () => {
      events.push('svg:first:start');
      await new Promise<void>(resolve => {
        releaseFirstRender = resolve;
      });
      events.push('svg:first:end');
      return '<svg>first</svg>';
    });
    svg.mockImplementationOnce(async () => {
      events.push('svg:second:start');
      return '<svg>second</svg>';
    });

    const first = renderTypstSvgWithOptions('= First', {
      fontUrls: ['font-a'],
    });
    const second = renderTypstSvgWithOptions('= Second', {
      fontUrls: ['font-b'],
    });

    await vi.waitFor(() => {
      expect(events).toEqual(['svg:first:start']);
    });

    releaseFirstRender();

    await expect(first).resolves.toEqual({ svg: '<svg>first</svg>' });
    await expect(second).resolves.toEqual({ svg: '<svg>second</svg>' });
    expect(events).toEqual([
      'svg:first:start',
      'svg:first:end',
      'svg:second:start',
    ]);
  });
});
