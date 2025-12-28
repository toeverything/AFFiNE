import { $typst, type BeforeBuildFn, loadFonts } from '@myriaddreamin/typst.ts';

const FONT_CDN_URLS = [
  'https://cdn.affine.pro/fonts/Inter-Regular.woff',
  'https://cdn.affine.pro/fonts/Inter-SemiBold.woff',
  'https://cdn.affine.pro/fonts/Inter-Italic.woff',
  'https://cdn.affine.pro/fonts/Inter-SemiBoldItalic.woff',
  'https://cdn.affine.pro/fonts/SarasaGothicCL-Regular.ttf',
] as const;

const getBeforeBuildHooks = (): BeforeBuildFn[] => [
  loadFonts([...FONT_CDN_URLS]),
];

const compilerWasmUrl = new URL(
  '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm',
  import.meta.url
).toString();

const rendererWasmUrl = new URL(
  '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm',
  import.meta.url
).toString();

let typstInitPromise: Promise<void> | null = null;

export async function ensureTypstReady() {
  if (typstInitPromise) {
    return typstInitPromise;
  }

  typstInitPromise = Promise.resolve()
    .then(() => {
      $typst.setCompilerInitOptions({
        beforeBuild: getBeforeBuildHooks(),
        getModule: () => compilerWasmUrl,
      });

      $typst.setRendererInitOptions({
        beforeBuild: getBeforeBuildHooks(),
        getModule: () => rendererWasmUrl,
      });
    })
    .catch(error => {
      typstInitPromise = null;
      throw error;
    });

  return typstInitPromise;
}

export async function getTypst() {
  await ensureTypstReady();
  return $typst;
}

export const TYPST_FONT_URLS = FONT_CDN_URLS;
