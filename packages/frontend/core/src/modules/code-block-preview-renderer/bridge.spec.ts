import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

const { desktopPreviewApis, mermaidRender, typstRender } = vi.hoisted(() => {
  return {
    mermaidRender: vi.fn(),
    typstRender: vi.fn(),
    desktopPreviewApis: {} as {
      preview?: {
        renderMermaidSvg?: (request: {
          code: string;
        }) => Promise<{ svg: string }>;
        renderTypstSvg?: (request: {
          code: string;
        }) => Promise<{ svg: string }>;
      };
    },
  };
});

const { domPurifySanitize } = vi.hoisted(() => ({
  domPurifySanitize: vi.fn((value: unknown) => {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/<script[\s\S]*?<\/script>/gi, '');
  }),
}));

vi.mock('@affine/core/modules/mermaid/renderer', () => ({
  getMermaidRenderer: () => ({
    render: mermaidRender,
  }),
}));

vi.mock('@affine/core/modules/typst/renderer', () => ({
  getTypstRenderer: () => ({
    render: typstRender,
  }),
}));

vi.mock('@affine/electron-api', () => ({
  apis: desktopPreviewApis,
}));

vi.mock('dompurify', () => ({
  default: {
    sanitize: domPurifySanitize,
  },
}));

import { renderMermaidSvg, renderTypstSvg } from './bridge';

const initialBuildConfig = globalThis.BUILD_CONFIG;

describe('preview render bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domPurifySanitize.mockImplementation((value: unknown) => {
      if (typeof value !== 'string') {
        return '';
      }
      return value.replace(/<script[\s\S]*?<\/script>/gi, '');
    });
    globalThis.BUILD_CONFIG = {
      ...initialBuildConfig,
      isElectron: false,
    };
    desktopPreviewApis.preview = undefined;
  });

  afterAll(() => {
    globalThis.BUILD_CONFIG = initialBuildConfig;
  });

  test('uses worker renderers and only sanitizes mermaid output', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg><script>alert(1)</script><text>mermaid</text></svg>',
    });
    typstRender.mockResolvedValue({
      svg: '<div><script>window.__xss__=1</script><svg><text>typst</text></svg></div>',
    });

    const mermaid = await renderMermaidSvg({ code: 'flowchart TD;A-->B' });
    const typst = await renderTypstSvg({ code: '= Title' });

    expect(mermaidRender).toHaveBeenCalledTimes(1);
    expect(typstRender).toHaveBeenCalledTimes(1);
    expect(mermaid.svg).toContain('<svg');
    expect(mermaid.svg).toContain('mermaid');
    expect(mermaid.svg).not.toContain('<script');
    expect(typst.svg).toBe(
      '<div><script>window.__xss__=1</script><svg><text>typst</text></svg></div>'
    );
  });

  test('prefers desktop preview handlers on electron', async () => {
    const renderMermaidFromDesktop = vi.fn().mockResolvedValue({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><text>desktop</text></svg>`,
    });
    const renderTypstFromDesktop = vi.fn().mockResolvedValue({
      svg: `<svg xmlns="http://www.w3.org/2000/svg"><text>desktop</text></svg>`,
    });
    desktopPreviewApis.preview = {
      renderMermaidSvg: renderMermaidFromDesktop,
      renderTypstSvg: renderTypstFromDesktop,
    };
    globalThis.BUILD_CONFIG = {
      ...initialBuildConfig,
      isElectron: true,
    };

    const mermaid = await renderMermaidSvg({ code: 'flowchart TD;A-->B' });
    const typst = await renderTypstSvg({ code: '= Title' });

    expect(renderMermaidFromDesktop).toHaveBeenCalledTimes(1);
    expect(renderTypstFromDesktop).toHaveBeenCalledTimes(1);
    expect(mermaidRender).not.toHaveBeenCalled();
    expect(typstRender).not.toHaveBeenCalled();
    expect(mermaid.svg).toContain('<svg');
    expect(typst.svg).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg"><text>desktop</text></svg>`
    );
  });

  test('throws on electron when native handlers are missing', async () => {
    globalThis.BUILD_CONFIG = {
      ...initialBuildConfig,
      isElectron: true,
    };
    desktopPreviewApis.preview = {};

    await expect(
      renderMermaidSvg({ code: 'flowchart TD;A-->B' })
    ).rejects.toThrow(
      'Electron preview handler "renderMermaidSvg" is unavailable.'
    );
    await expect(renderTypstSvg({ code: '= Title' })).rejects.toThrow(
      'Electron preview handler "renderTypstSvg" is unavailable.'
    );

    expect(mermaidRender).not.toHaveBeenCalled();
    expect(typstRender).not.toHaveBeenCalled();
  });

  test('throws when sanitized svg is empty', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<div><text>invalid</text></div>',
    });

    await expect(
      renderMermaidSvg({ code: 'flowchart TD;A-->B' })
    ).rejects.toThrow('Preview renderer returned invalid SVG.');
  });
});
