import { $typst, type BeforeBuildFn, loadFonts } from '@myriaddreamin/typst.ts';

import type { TypstRenderOptions } from './types';

export const DEFAULT_TYPST_FONT_URLS = [
  'https://cdn.affine.pro/fonts/Inter-Regular.woff',
  'https://cdn.affine.pro/fonts/Inter-SemiBold.woff',
  'https://cdn.affine.pro/fonts/Inter-Italic.woff',
  'https://cdn.affine.pro/fonts/Inter-SemiBoldItalic.woff',
  'https://cdn.affine.pro/fonts/SarasaGothicCL-Regular.ttf',
] as const;

export const DEFAULT_TYPST_RENDER_OPTIONS: TypstRenderOptions = {
  fontUrls: [...DEFAULT_TYPST_FONT_URLS],
};

const DEFAULT_FONT_FALLBACKS: Record<string, string> = {
  'Inter-Regular.woff': 'Inter-Regular.woff2',
  'Inter-SemiBold.woff': 'Inter-SemiBold.woff2',
  'Inter-Italic.woff': 'Inter-Italic.woff2',
  'Inter-SemiBoldItalic.woff': 'Inter-SemiBoldItalic.woff2',
  'SarasaGothicCL-Regular.ttf': 'Inter-Regular.woff2',
  'Inter-Regular.woff2': 'Inter-Regular.woff2',
  'Inter-SemiBold.woff2': 'Inter-SemiBold.woff2',
  'Inter-Italic.woff2': 'Inter-Italic.woff2',
  'Inter-SemiBoldItalic.woff2': 'Inter-SemiBoldItalic.woff2',
};

const compilerWasmUrl = new URL(
  '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm',
  import.meta.url
).toString();

const rendererWasmUrl = new URL(
  '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm',
  import.meta.url
).toString();

type TypstWasmModuleUrls = {
  compilerWasmUrl?: string;
  rendererWasmUrl?: string;
};

type TypstInitState = {
  key: string;
  promise: Promise<void>;
};

let typstInitState: TypstInitState | null = null;
let typstRenderQueue: Promise<void> = Promise.resolve();

function extractInputUrl(input: RequestInfo | URL): string | null {
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof input === 'string') {
    return input;
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  return null;
}

function resolveLocalFallbackFontUrl(sourceUrl: string): string | null {
  if (typeof location === 'undefined') {
    return null;
  }

  const source = new URL(sourceUrl, location.href);
  const fileName = source.pathname.split('/').at(-1);
  if (!fileName) {
    return null;
  }

  const fallbackFileName = DEFAULT_FONT_FALLBACKS[fileName];
  if (!fallbackFileName) {
    return null;
  }

  const workerUrl = new URL(location.href);
  const jsPathMarker = '/js/';
  const markerIndex = workerUrl.pathname.lastIndexOf(jsPathMarker);
  const basePath =
    markerIndex >= 0 ? workerUrl.pathname.slice(0, markerIndex + 1) : '/';

  return new URL(
    `${basePath}fonts/${fallbackFileName}`,
    workerUrl.origin
  ).toString();
}

export function createTypstFontFetcher(baseFetcher: typeof fetch = fetch) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const sourceUrl = extractInputUrl(input);
    const fallbackUrl = sourceUrl
      ? resolveLocalFallbackFontUrl(sourceUrl)
      : null;

    try {
      const response = await baseFetcher(input, init);
      if (!fallbackUrl || response.ok || fallbackUrl === sourceUrl) {
        return response;
      }

      const fallbackResponse = await baseFetcher(fallbackUrl, init);
      return fallbackResponse.ok ? fallbackResponse : response;
    } catch (error) {
      if (!fallbackUrl || fallbackUrl === sourceUrl) {
        throw error;
      }

      return baseFetcher(fallbackUrl, init);
    }
  };
}

export function mergeTypstRenderOptions(
  base: TypstRenderOptions,
  override: TypstRenderOptions | undefined
): TypstRenderOptions {
  return {
    ...base,
    ...override,
    fontUrls: override?.fontUrls ?? base.fontUrls,
  };
}

function getBeforeBuildHooks(fontUrls: string[]): BeforeBuildFn[] {
  return [
    loadFonts([...fontUrls], {
      assets: ['text'],
      fetcher: createTypstFontFetcher(),
    }),
  ];
}

function createTypstInitKey(
  fontUrls: string[],
  wasmModuleUrls: TypstWasmModuleUrls
) {
  return JSON.stringify({
    fontUrls,
    compilerWasmUrl: wasmModuleUrls.compilerWasmUrl ?? compilerWasmUrl,
    rendererWasmUrl: wasmModuleUrls.rendererWasmUrl ?? rendererWasmUrl,
  });
}

function enqueueTypstRender<T>(task: () => Promise<T>): Promise<T> {
  const run = typstRenderQueue.then(task, task);
  typstRenderQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function ensureTypstReady(
  fontUrls: string[],
  wasmModuleUrls: TypstWasmModuleUrls = {}
) {
  const key = createTypstInitKey(fontUrls, wasmModuleUrls);
  if (typstInitState?.key === key) {
    return typstInitState.promise;
  }

  const promise = Promise.resolve()
    .then(() => {
      const compilerBeforeBuild = getBeforeBuildHooks(fontUrls);

      $typst.setCompilerInitOptions({
        beforeBuild: compilerBeforeBuild,
        getModule: () => wasmModuleUrls.compilerWasmUrl ?? compilerWasmUrl,
      });
      $typst.setRendererInitOptions({
        getModule: () => wasmModuleUrls.rendererWasmUrl ?? rendererWasmUrl,
      });
    })
    .catch(error => {
      if (typstInitState?.key === key) {
        typstInitState = null;
      }
      throw error;
    });

  typstInitState = { key, promise };
  return promise;
}

export async function renderTypstSvgWithOptions(
  code: string,
  options: TypstRenderOptions | undefined,
  wasmModuleUrls?: TypstWasmModuleUrls
) {
  const resolvedOptions = mergeTypstRenderOptions(
    DEFAULT_TYPST_RENDER_OPTIONS,
    options
  );
  return enqueueTypstRender(async () => {
    await ensureTypstReady(
      resolvedOptions.fontUrls ?? [...DEFAULT_TYPST_FONT_URLS],
      wasmModuleUrls
    );
    const svg = await $typst.svg({
      mainContent: code,
    });
    return { svg };
  });
}
