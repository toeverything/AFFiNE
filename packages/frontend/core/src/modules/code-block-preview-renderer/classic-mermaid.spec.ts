import { beforeEach, describe, expect, test, vi } from 'vitest';

const { initialize, render } = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize,
    render,
  },
}));

import { renderClassicMermaidSvg } from './classic-mermaid';

describe('renderClassicMermaidSvg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('serializes initialize and render across concurrent calls', async () => {
    const events: string[] = [];
    let releaseFirstRender!: () => void;

    initialize.mockImplementation(config => {
      events.push(`init:${config.theme}`);
    });
    render
      .mockImplementationOnce(async () => {
        events.push('render:first:start');
        await new Promise<void>(resolve => {
          releaseFirstRender = resolve;
        });
        events.push('render:first:end');
        return { svg: '<svg>first</svg>' };
      })
      .mockImplementationOnce(async () => {
        events.push('render:second:start');
        return { svg: '<svg>second</svg>' };
      });

    const first = renderClassicMermaidSvg({
      code: 'flowchart TD;A-->B',
      options: { theme: 'default' },
    });
    const second = renderClassicMermaidSvg({
      code: 'flowchart TD;B-->C',
      options: { theme: 'modern' },
    });

    await vi.waitFor(() => {
      expect(events).toEqual(['init:default', 'render:first:start']);
    });

    releaseFirstRender();

    await expect(first).resolves.toEqual({ svg: '<svg>first</svg>' });
    await expect(second).resolves.toEqual({ svg: '<svg>second</svg>' });
    expect(events).toEqual([
      'init:default',
      'render:first:start',
      'render:first:end',
      'init:base',
      'render:second:start',
    ]);
  });
});
