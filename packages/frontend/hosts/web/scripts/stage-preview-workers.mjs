#!/usr/bin/env node
// @ts-check

import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FRONTEND_ROOT = resolve(WEB_ROOT, '../..');
const ASSETS_DIR = join(WEB_ROOT, 'assets');
const FONTS_OUT_DIR = join(ASSETS_DIR, 'fonts');
const SOURCE_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : '/tmp/preview-wasm';
const BUILD_HASH = process.argv[3] || 'dev-local';

const KINDS = ['mermaid', 'math', 'typst', 'pdf'];
const FONT_SPECS = [
  {
    src: join(
      FRONTEND_ROOT,
      'component/src/fonts/inter/Inter-VariableFont_slnt,wght.ttf'
    ),
    outName: `inter-latin.${BUILD_HASH}.ttf`,
  },
  {
    src: join(
      FRONTEND_ROOT,
      'component/src/fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf'
    ),
    outName: `ibm-plex-mono.${BUILD_HASH}.ttf`,
  },
];

mkdirSync(ASSETS_DIR, { recursive: true });
mkdirSync(FONTS_OUT_DIR, { recursive: true });

for (const kind of KINDS) {
  const src = join(SOURCE_DIR, `${kind}.wasm`);
  if (!existsSync(src)) {
    throw new Error(`Missing built preview wasm binary: ${src}`);
  }
  const dst = join(ASSETS_DIR, `${kind}-worker.${BUILD_HASH}.wasm`);
  copyFileSync(src, dst);
}

const PKG_OUT_DIR = join(ASSETS_DIR, 'pkg');
const pkgSrcDir = join(SOURCE_DIR, 'pkg');
if (
  existsSync(join(pkgSrcDir, 'playground.js')) &&
  existsSync(join(pkgSrcDir, 'playground_bg.wasm'))
) {
  mkdirSync(PKG_OUT_DIR, { recursive: true });
  copyFileSync(
    join(pkgSrcDir, 'playground.js'),
    join(PKG_OUT_DIR, 'playground.js')
  );
  copyFileSync(
    join(pkgSrcDir, 'playground_bg.wasm'),
    join(PKG_OUT_DIR, 'playground_bg.wasm')
  );
  const snippetsSrc = join(pkgSrcDir, 'snippets');
  if (existsSync(snippetsSrc)) {
    cpSync(snippetsSrc, join(PKG_OUT_DIR, 'snippets'), { recursive: true });
  }
} else {
  throw new Error(`Missing main wasm-bindgen package under: ${pkgSrcDir}`);
}

for (const font of FONT_SPECS) {
  if (!existsSync(font.src)) {
    throw new Error(`Missing tracked font source: ${font.src}`);
  }
  copyFileSync(font.src, join(FONTS_OUT_DIR, font.outName));
}

console.log(
  `Staged 4 preview Wasm workers, main playground Wasm bundle, and ${FONT_SPECS.length} static fonts into ${ASSETS_DIR}`
);
