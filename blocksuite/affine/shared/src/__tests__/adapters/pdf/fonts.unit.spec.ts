import { FontFamily, FontStyle, FontWeight } from '@blocksuite/affine-model';
import { describe, expect, test, vi } from 'vitest';

import { createPdfFontLoader } from '../../../adapters/pdf/fonts.js';
import type { FontConfig } from '../../../services/font-loader/config.js';

const localInter = (
  file: string,
  weight: FontWeight,
  style: FontStyle
): FontConfig => ({
  font: FontFamily.Inter,
  url: `/fonts/${file}`,
  weight,
  style,
});

const editorFontConfig: FontConfig[] = [
  localInter('Inter-Regular.woff2', FontWeight.Regular, FontStyle.Normal),
  localInter('Inter-SemiBold.woff2', FontWeight.SemiBold, FontStyle.Normal),
  localInter('Inter-Italic.woff2', FontWeight.Regular, FontStyle.Italic),
  localInter(
    'Inter-SemiBoldItalic.woff2',
    FontWeight.SemiBold,
    FontStyle.Italic
  ),
];

const fontResponse = (url: string) =>
  new Response(new TextEncoder().encode(url.split('/').pop()));

const decode = (base64: string) => atob(base64);

describe('createPdfFontLoader', () => {
  test('uses the CDN fonts when they load', async () => {
    const fetcher = vi.fn(async (url: string) => fontResponse(url));
    const load = createPdfFontLoader(fetcher as unknown as typeof fetch);

    const { fonts, vfs } = await load(editorFontConfig);

    expect(fonts.Inter).toEqual({
      normal: 'Inter-Regular.woff',
      bold: 'Inter-SemiBold.woff',
      italics: 'Inter-Italic.woff',
      bolditalics: 'Inter-SemiBoldItalic.woff',
    });
    expect(fonts.SarasaGothicCL?.normal).toBe('SarasaGothicCL-Regular.ttf');
    expect(decode(vfs['Inter-SemiBold.woff'])).toBe('Inter-SemiBold.woff');
    expect(fetcher).not.toHaveBeenCalledWith('/fonts/Inter-Regular.woff2');
  });

  test('falls back to the editor fonts when the CDN is blocked', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://cdn.affine.pro/')) {
        throw new TypeError('Failed to fetch');
      }
      return fontResponse(url);
    });
    const load = createPdfFontLoader(fetcher as unknown as typeof fetch);

    const { fonts, vfs } = await load(editorFontConfig);

    expect(fonts.Inter).toEqual({
      normal: 'Inter-Regular.woff2',
      bold: 'Inter-SemiBold.woff2',
      italics: 'Inter-Italic.woff2',
      bolditalics: 'Inter-SemiBoldItalic.woff2',
    });
    expect(fonts.SarasaGothicCL?.bold).toBe('Inter-Regular.woff2');
    expect(decode(vfs['Inter-Italic.woff2'])).toBe('Inter-Italic.woff2');
  });

  test('rejects when a font cannot be loaded from anywhere', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('Inter-SemiBold.woff2')
        ? new Response(null, { status: 404 })
        : Promise.reject(new TypeError('Failed to fetch'))
    );
    const load = createPdfFontLoader(fetcher as unknown as typeof fetch);

    await expect(load(editorFontConfig)).rejects.toThrow();
  });

  test('reuses fonts it already loaded', async () => {
    const fetcher = vi.fn(async (url: string) => fontResponse(url));
    const load = createPdfFontLoader(fetcher as unknown as typeof fetch);

    await load(editorFontConfig);
    const calls = fetcher.mock.calls.length;
    await load(editorFontConfig);

    expect(fetcher).toHaveBeenCalledTimes(calls);
  });
});
