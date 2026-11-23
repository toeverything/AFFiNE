import { FontFamily, FontStyle, FontWeight } from '@blocksuite/affine-model';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createPdfFontLoader,
  PDF_FONT_IDLE_TIMEOUT_MS,
} from '../../../adapters/pdf/fonts.js';
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
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(
      '/fonts/Inter-Regular.woff2'
    );
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
    expect(decode(vfs['Inter-Italic.woff2'])).toBe('Inter-Italic.woff2');
  });

  test('replaces the CJK font with Inter regular when the CDN is blocked', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://cdn.affine.pro/')) {
        throw new TypeError('Failed to fetch');
      }
      return fontResponse(url);
    });
    const load = createPdfFontLoader(fetcher as unknown as typeof fetch);

    const { fonts } = await load(editorFontConfig);

    expect(fonts.SarasaGothicCL).toEqual({
      normal: 'Inter-Regular.woff2',
      bold: 'Inter-Regular.woff2',
      italics: 'Inter-Regular.woff2',
      bolditalics: 'Inter-Regular.woff2',
    });
  });

  test('rejects when a font cannot be loaded from anywhere', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/Inter-SemiBold.')
        ? new Response(null, { status: 404 })
        : fontResponse(url)
    );
    const load = createPdfFontLoader(fetcher as unknown as typeof fetch);

    await expect(load(editorFontConfig)).rejects.toThrow(/404/);
  });

  describe('with a slow CDN', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const loadWithCdn = async (
      cdnResponse: (url: string) => Promise<Response>,
      elapsedMs = PDF_FONT_IDLE_TIMEOUT_MS
    ) => {
      const fetcher = vi.fn(async (url: string) =>
        url.startsWith('https://cdn.affine.pro/')
          ? cdnResponse(url)
          : fontResponse(url)
      );
      const result = createPdfFontLoader(fetcher as unknown as typeof fetch)(
        editorFontConfig
      );
      await vi.advanceTimersByTimeAsync(elapsedMs);
      return result;
    };

    test('falls back when no response arrives', async () => {
      const { fonts } = await loadWithCdn(() => new Promise(() => {}));

      expect(fonts.Inter?.normal).toBe('Inter-Regular.woff2');
    });

    test('falls back when the response body stops arriving', async () => {
      const { fonts } = await loadWithCdn(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
        });
        return new Response(body);
      });

      expect(fonts.Inter?.normal).toBe('Inter-Regular.woff2');
    });

    test('keeps a download that is slow but still making progress', async () => {
      const { fonts, vfs } = await loadWithCdn(async url => {
        let chunks = 0;
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            await new Promise(resolve =>
              setTimeout(resolve, PDF_FONT_IDLE_TIMEOUT_MS - 1)
            );
            if (chunks++ < 2) {
              controller.enqueue(new TextEncoder().encode(url.slice(-4)));
            } else {
              controller.close();
            }
          },
        });
        return new Response(body);
      }, 4 * PDF_FONT_IDLE_TIMEOUT_MS);

      expect(fonts.Inter?.normal).toBe('Inter-Regular.woff');
      expect(decode(vfs['Inter-Regular.woff'])).toBe('woffwoff');
    });
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
