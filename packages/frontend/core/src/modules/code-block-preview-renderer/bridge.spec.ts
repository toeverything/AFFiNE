/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { mermaidRender, typstRender } = vi.hoisted(() => ({
  mermaidRender: vi.fn(),
  typstRender: vi.fn(),
}));

const { domPurifySanitize, sanitizeSvgForMock } = vi.hoisted(() => {
  const sanitizeSvgForMock = (value: unknown) => {
    if (typeof value !== 'string') {
      return '';
    }
    if (
      typeof DOMParser === 'undefined' ||
      typeof XMLSerializer === 'undefined'
    ) {
      return value;
    }

    const doc = new DOMParser().parseFromString(value, 'image/svg+xml');
    doc.querySelectorAll('script').forEach(element => {
      element.remove();
    });
    return new XMLSerializer().serializeToString(doc.documentElement);
  };

  return {
    domPurifySanitize: vi.fn(sanitizeSvgForMock),
    sanitizeSvgForMock,
  };
});

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
    domPurifySanitize.mockImplementation(sanitizeSvgForMock);
  });

  test('uses worker renderers and sanitizes preview svg output', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg><script>alert(1)</script><text>mermaid</text></svg>',
    });
    typstRender.mockResolvedValue({
      svg: '<svg><script>window.__xss__=1</script><text>typst</text></svg>',
    });

    const mermaid = await renderMermaidSvg({ code: 'flowchart TD;A-->B' });
    const typst = await renderTypstSvg({ code: '= Title' });

    expect(mermaidRender).toHaveBeenCalledTimes(1);
    expect(typstRender).toHaveBeenCalledTimes(1);
    expect(mermaid.svg).toContain('<svg');
    expect(mermaid.svg).toContain('mermaid');
    expect(mermaid.svg).not.toContain('<script');
    expect(typst.svg).toContain('<svg');
    expect(typst.svg).toContain('typst');
    expect(typst.svg).not.toContain('<script');
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

  test('sanitizeSvg wraps sanitized svg fragments back into root svg', () => {
    if (typeof DOMParser === 'undefined') {
      return;
    }

    domPurifySanitize.mockImplementation((value: unknown) => {
      if (typeof value !== 'string') {
        return '';
      }
      return '<rect width="100" height="100"></rect>';
    });

    const sanitized = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"></rect></svg>'
    );

    expect(sanitized).toContain('<svg');
    expect(sanitized).toContain('width="100"');
    expect(sanitized).toContain('<rect');
  });

  test('throws when sanitized typst svg is empty', async () => {
    typstRender.mockResolvedValue({
      svg: '<div><text>invalid</text></div>',
    });

    await expect(renderTypstSvg({ code: '= Title' })).rejects.toThrow(
      'Preview renderer returned invalid SVG.'
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
