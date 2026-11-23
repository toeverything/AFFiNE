import path from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { native } = vi.hoisted(() => ({
  native: {
    renderMermaidSvg: vi.fn(),
    renderTypstSvg: vi.fn(),
  },
}));

vi.mock('@affine/native', () => native);

const tmpDir = path.join(__dirname, 'tmp');
const typstFontDirA = path.join(tmpDir, 'fonts-a');
const typstFontDirB = path.join(tmpDir, 'fonts-b');

async function loadPreviewHandlers() {
  vi.resetModules();
  const module = await import('../../src/helper/preview');
  return module.previewHandlers;
}

describe('helper preview handlers', () => {
  beforeEach(async () => {
    await fs.ensureDir(typstFontDirA);
    await fs.ensureDir(typstFontDirB);
    process.env.AFFINE_TYPST_FONT_DIRS = [
      typstFontDirA,
      typstFontDirB,
      path.join(tmpDir, 'missing'),
    ].join(path.delimiter);
    native.renderMermaidSvg.mockReset();
    native.renderTypstSvg.mockReset();
    native.renderMermaidSvg.mockReturnValue({
      svg: '<svg><text>mermaid</text></svg>',
    });
    native.renderTypstSvg.mockReturnValue({
      svg: '<svg><text>typst</text></svg>',
    });
  });

  afterEach(async () => {
    delete process.env.AFFINE_TYPST_FONT_DIRS;
    await fs.remove(tmpDir);
  });

  test('passes mermaid request to native renderer', async () => {
    const previewHandlers = await loadPreviewHandlers();
    const request = { code: 'flowchart TD; A-->B' };

    await previewHandlers.renderMermaidSvg(request);

    expect(native.renderMermaidSvg).toHaveBeenCalledWith(request);
  });

  test('injects resolved fontDirs into typst requests', async () => {
    const previewHandlers = await loadPreviewHandlers();

    await previewHandlers.renderTypstSvg({ code: '= hello' });

    const [request] = native.renderTypstSvg.mock.calls[0];
    expect(request.options?.fontDirs).toEqual(
      expect.arrayContaining([
        path.resolve(typstFontDirA),
        path.resolve(typstFontDirB),
      ])
    );
  });

  test('keeps explicit typst fontDirs', async () => {
    const previewHandlers = await loadPreviewHandlers();
    const request = {
      code: '= hello',
      options: {
        fontDirs: ['/tmp/custom-fonts'],
      },
    };

    await previewHandlers.renderTypstSvg(request);

    expect(native.renderTypstSvg).toHaveBeenCalledWith(request);
  });
});
