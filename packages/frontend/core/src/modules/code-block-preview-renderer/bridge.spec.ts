import { beforeEach, describe, expect, test, vi } from 'vitest';

const { mermaidRender, typstRender } = vi.hoisted(() => ({
  mermaidRender: vi.fn(),
  typstRender: vi.fn(),
}));

const { domPurifySanitize } = vi.hoisted(() => ({
  domPurifySanitize: vi.fn((value: unknown) => {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/<script[\s\S]*?<\/script>/gi, '');
  }),
}));

vi.mock(
  '@affine/core/modules/code-block-preview-renderer/platform-backend',
  () => ({
    renderMermaidSvgBackend: mermaidRender,
    renderTypstSvgBackend: typstRender,
  })
);

vi.mock('dompurify', () => ({
  default: {
    sanitize: domPurifySanitize,
  },
}));

import { renderMermaidSvg, renderTypstSvg } from './bridge';

describe('preview render bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domPurifySanitize.mockImplementation((value: unknown) => {
      if (typeof value !== 'string') {
        return '';
      }
      return value.replace(/<script[\s\S]*?<\/script>/gi, '');
    });
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

  test('throws when sanitized svg is empty', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<div><text>invalid</text></div>',
    });

    await expect(
      renderMermaidSvg({ code: 'flowchart TD;A-->B' })
    ).rejects.toThrow('Preview renderer returned invalid SVG.');
  });
});
