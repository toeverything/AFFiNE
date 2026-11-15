import { FontFamily, FontStyle, FontWeight } from '@blocksuite/affine-model';
import type { TFontDictionary } from 'pdfmake/interfaces';

import type { FontConfig } from '../../services/font-loader/config.js';

const PDF_FONT_CDN = 'https://cdn.affine.pro/fonts/';

type PdfFontVariant = 'normal' | 'bold' | 'italics' | 'bolditalics';

type PdfFontSource = {
  file: string;
  // Inter face in the editor font config to use when the CDN file can't be loaded.
  weight: FontWeight;
  style: FontStyle;
};

const sarasa: PdfFontSource = {
  file: 'SarasaGothicCL-Regular.ttf',
  weight: FontWeight.Regular,
  style: FontStyle.Normal,
};

const PDF_FONT_SOURCES: Record<
  string,
  Record<PdfFontVariant, PdfFontSource>
> = {
  Inter: {
    normal: {
      file: 'Inter-Regular.woff',
      weight: FontWeight.Regular,
      style: FontStyle.Normal,
    },
    bold: {
      file: 'Inter-SemiBold.woff',
      weight: FontWeight.SemiBold,
      style: FontStyle.Normal,
    },
    italics: {
      file: 'Inter-Italic.woff',
      weight: FontWeight.Regular,
      style: FontStyle.Italic,
    },
    bolditalics: {
      file: 'Inter-SemiBoldItalic.woff',
      weight: FontWeight.SemiBold,
      style: FontStyle.Italic,
    },
  },
  SarasaGothicCL: {
    normal: sarasa,
    bold: sarasa,
    italics: sarasa,
    bolditalics: sarasa,
  },
};

export type PdfFonts = {
  fonts: TFontDictionary;
  vfs: Record<string, string>;
};

// The CDN only allows app.affine.pro (CORS), so other origins use the editor's own Inter files.
export function createPdfFontLoader(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, Promise<string>>();

  const fetchFont = (url: string) => {
    let data = cache.get(url);
    if (!data) {
      data = fetcher(url).then(async response => {
        if (!response.ok) {
          throw new Error(`Failed to load font ${url}: ${response.status}`);
        }
        return arrayBufferToBase64(await response.arrayBuffer());
      });
      cache.set(url, data);
      data.catch(() => cache.delete(url));
    }
    return data;
  };

  const loadSource = async (
    source: PdfFontSource,
    fontConfig: FontConfig[],
    vfs: Record<string, string>
  ) => {
    const fallback = fontConfig.find(
      config =>
        config.font === FontFamily.Inter &&
        config.weight === source.weight &&
        config.style === source.style
    )?.url;
    const urls = [PDF_FONT_CDN + source.file];
    if (fallback) urls.push(fallback);

    let lastError: unknown;
    for (const url of urls) {
      try {
        const data = await fetchFont(url);
        const name = url.split('/').pop() ?? url;
        vfs[name] = data;
        return name;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };

  return async (fontConfig: FontConfig[] = []): Promise<PdfFonts> => {
    const fonts: TFontDictionary = {};
    const vfs: Record<string, string> = {};
    await Promise.all(
      Object.entries(PDF_FONT_SOURCES).map(async ([family, variants]) => {
        const [normal, bold, italics, bolditalics] = await Promise.all([
          loadSource(variants.normal, fontConfig, vfs),
          loadSource(variants.bold, fontConfig, vfs),
          loadSource(variants.italics, fontConfig, vfs),
          loadSource(variants.bolditalics, fontConfig, vfs),
        ]);
        fonts[family] = { normal, bold, italics, bolditalics };
      })
    );
    return { fonts, vfs };
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
