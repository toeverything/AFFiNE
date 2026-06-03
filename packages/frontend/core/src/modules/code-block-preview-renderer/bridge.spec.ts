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

import { renderMermaidSvg, renderTypstSvg, sanitizeSvg } from './bridge';

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

  test('sanitizeSvg keeps svg text nodes', () => {
    if (typeof DOMParser === 'undefined') {
      return;
    }

    const sanitized = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>A</text></svg>'
    );

    expect(sanitized).toContain('>A<');
  });

  test('sanitizeSvg keeps use elements for mermaid label references', () => {
    if (typeof DOMParser === 'undefined') {
      return;
    }

    const sanitized = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><text id="lbl">A</text></defs><use xlink:href="#lbl"/></svg>'
    );

    expect(sanitized).toMatch(/<use[\s>]/i);
    expect(sanitized).toContain('#lbl');
  });

  test('sanitizeSvg keeps sanitized foreignObject label text', () => {
    if (typeof DOMParser === 'undefined') {
      return;
    }

    const sanitized = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script>A</div></foreignObject></svg>'
    );

    expect(sanitized).toMatch(/foreignObject/i);
    expect(sanitized).toContain('>A<');
    expect(sanitized).not.toContain('<script');
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
