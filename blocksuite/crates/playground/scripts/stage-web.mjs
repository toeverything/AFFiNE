#!/usr/bin/env node
// @ts-check

// Stages standalone `playground/web` (`pkg/playground.{js,_bg.wasm}`)
// and shared Web Worker preview scripts (`wasm-scalar-rpc.js`,
// `workers/preview-worker-core.js`, `workers/*-worker.js`) and built preview
// Wasm binaries (`workers/*-worker.wasm`) and the tracked `ui-tokens` fonts
// (`assets/fonts/*.ttf`, fetched by `index.html` before the window opens), then
// verifies all relative ESM imports resolve inside the staged output directory.

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYGROUND_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO_ROOT = resolve(PLAYGROUND_ROOT, '../../..');
const HOST_WEB_SRC = join(REPO_ROOT, 'packages/frontend/hosts/web/src');
const FONTS_SRC = join(REPO_ROOT, 'packages/ui/tokens/fonts');

const args = process.argv.slice(2);
let sourceDirArg = '/tmp/preview-wasm';
let outDirArg = join(PLAYGROUND_ROOT, 'web');
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out' && args[i + 1]) {
    outDirArg = args[i + 1];
    i += 1;
  } else if (!args[i].startsWith('--')) {
    sourceDirArg = args[i];
  }
}

const SOURCE_DIR = resolve(sourceDirArg);
const WEB_DIR = resolve(outDirArg);
const KINDS = ['math', 'pdf', 'mermaid', 'typst'];
const WORKER_FILES = [
  'preview-worker-core.js',
  ...KINDS.map(k => `${k}-worker.js`),
];

const pkgSrc = join(SOURCE_DIR, 'pkg');
const pkgDst = join(WEB_DIR, 'pkg');
if (
  existsSync(join(pkgSrc, 'playground.js')) &&
  existsSync(join(pkgSrc, 'playground_bg.wasm'))
) {
  mkdirSync(pkgDst, { recursive: true });
  copyFileSync(join(pkgSrc, 'playground.js'), join(pkgDst, 'playground.js'));
  copyFileSync(
    join(pkgSrc, 'playground_bg.wasm'),
    join(pkgDst, 'playground_bg.wasm')
  );
  const snippetsSrc = join(pkgSrc, 'snippets');
  if (existsSync(snippetsSrc)) {
    cpSync(snippetsSrc, join(pkgDst, 'snippets'), { recursive: true });
  }
}

mkdirSync(WEB_DIR, { recursive: true });
const rpcSrc = join(HOST_WEB_SRC, 'wasm-scalar-rpc.js');
if (!existsSync(rpcSrc)) {
  throw new Error(`Missing shared worker RPC helper: ${rpcSrc}`);
}
copyFileSync(rpcSrc, join(WEB_DIR, 'wasm-scalar-rpc.js'));

const workersDst = join(WEB_DIR, 'workers');
mkdirSync(workersDst, { recursive: true });

for (const fileName of WORKER_FILES) {
  const scriptSrc = join(HOST_WEB_SRC, 'workers', fileName);
  if (!existsSync(scriptSrc)) {
    throw new Error(`Missing worker script: ${scriptSrc}`);
  }
  copyFileSync(scriptSrc, join(workersDst, fileName));
}

let stagedWasmCount = 0;
for (const kind of KINDS) {
  const wasmSrc = join(SOURCE_DIR, `${kind}.wasm`);
  if (existsSync(wasmSrc)) {
    copyFileSync(wasmSrc, join(workersDst, `${kind}-worker.wasm`));
    stagedWasmCount += 1;
  }
}

const fontsDst = join(WEB_DIR, 'assets', 'fonts');
mkdirSync(fontsDst, { recursive: true });
const fontFiles = readdirSync(FONTS_SRC, { recursive: true }).filter(rel =>
  rel.endsWith('.ttf')
);
for (const rel of fontFiles) {
  copyFileSync(join(FONTS_SRC, rel), join(fontsDst, basename(rel)));
}

const stagedJsFiles = [
  join(WEB_DIR, 'wasm-scalar-rpc.js'),
  ...WORKER_FILES.map(f => join(workersDst, f)),
];
const importRe =
  /(?:from\s+|import\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g;
for (const jsPath of stagedJsFiles) {
  const src = readFileSync(jsPath, 'utf8');
  for (const match of src.matchAll(importRe)) {
    const target = resolve(dirname(jsPath), match[1]);
    if (!existsSync(target)) {
      throw new Error(
        `Unresolved relative ESM import '${match[1]}' in ${jsPath} -> ${target}`
      );
    }
  }
}

console.log(
  `Staged worker scripts, ${stagedWasmCount} .wasm files and ${fontFiles.length} fonts into ${WEB_DIR}`
);
