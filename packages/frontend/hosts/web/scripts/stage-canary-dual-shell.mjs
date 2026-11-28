#!/usr/bin/env node
// @ts-check

/**
 * Assembles a hosted `canary` dual-shell static release bundle for `affine-server`
 * (`--role front --deployment-mode cloud --channel canary --static-dir <out>`).
 *
 * Output layout under `<out>/`:
 *   - `index.html`, `assets/desktop.js` (desktop fallback shell unless `--desktop-dir` is given)
 *   - `mobile/index.html`, `mobile/sign-in.html` (cookie-immune `/mobile/...` asset URLs)
 *   - `mobile/src/**` (zero-build ES module thin host)
 *   - `mobile/wasm/{mermaid,math,typst,pdf}-worker.<shell_build_id>.wasm`
 *   - `mobile/pkg/{playground.js,playground_bg.wasm}`
 *   - `mobile/assets/fonts/{inter-latin,ibm-plex-mono}.<shell_build_id>.ttf`
 *   - `mobile/release-manifest.json` (immutable content-hash manifest)
 *   - `mobile-legacy/{index.html,app.js,yjs.mjs,assets-manifest.json}` (fallback shell using real `yjs`)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FRONTEND_ROOT = resolve(WEB_ROOT, '../..');
const REPO_ROOT = resolve(FRONTEND_ROOT, '..');
const WORKER_KINDS = ['mermaid', 'math', 'typst', 'pdf'];
const MIN_REAL_WASM_BYTES = 10 * 1024;
const PREVIEW_WORKER_REQUIRED_EXPORTS = [
  'affine_worker_reset_input',
  'affine_worker_push_input_u32',
  'affine_worker_invoke',
  'affine_worker_output_u32',
];
const PLAYGROUND_REQUIRED_EXPORTS = ['merge_updates_v1', 'extract_subdoc_ids'];

const FONT_SPECS = [
  {
    key: 'latin',
    prefix: 'inter-latin',
    src: join(
      FRONTEND_ROOT,
      'component/src/fonts/inter/Inter-VariableFont_slnt,wght.ttf'
    ),
  },
  {
    key: 'mono',
    prefix: 'ibm-plex-mono',
    src: join(
      FRONTEND_ROOT,
      'component/src/fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf'
    ),
  },
];

/**
 * Validates that a staged `.wasm` binary is a real compiled module (not a tiny
 * test stub) and exports every required function symbol.
 *
 * @param {string} label
 * @param {Buffer} bytes
 * @param {string[]} requiredExports
 */
export function validateRealWasmBinary(label, bytes, requiredExports) {
  if (!bytes || bytes.byteLength < MIN_REAL_WASM_BYTES) {
    throw new Error(
      `Invalid ${label}: expected real compiled Wasm (>= ${MIN_REAL_WASM_BYTES} bytes), got ${bytes ? bytes.byteLength : 0} bytes.`
    );
  }
  let mod;
  try {
    mod = new WebAssembly.Module(bytes);
  } catch (err) {
    throw new Error(
      `Invalid ${label}: failed to compile Wasm module (${err instanceof Error ? err.message : String(err)}).`
    );
  }
  const fnExports = WebAssembly.Module.exports(mod)
    .filter(exp => exp.kind === 'function')
    .map(exp => exp.name);
  const hasExport = name =>
    fnExports.some(
      expName => expName === name || expName.startsWith(`${name}_`)
    );
  const missing = requiredExports.filter(name => !hasExport(name));
  if (missing.length > 0) {
    throw new Error(
      `Invalid ${label}: missing required Wasm exports: ${missing.join(', ')}.`
    );
  }
}

/**
 * Recursively collects sorted file paths inside `dir`.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function listFilesSorted(dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) {
    return out;
  }
  /** @param {string} current */
  function visit(current) {
    const entries = readdirSync(current, { withFileTypes: true }).sort(
      (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    );
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  visit(dir);
  return out;
}

/**
 * @param {Buffer} buf
 * @returns {string}
 */
function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Resolves a built preview worker wasm binary from `wasmDir` or staged `assets/`.
 *
 * @param {string | null} wasmDir
 * @param {string} kind
 * @returns {string | null}
 */
function findWorkerWasm(wasmDir, kind) {
  const candidates = [];
  if (wasmDir) {
    candidates.push(join(wasmDir, `${kind}.wasm`));
    candidates.push(join(wasmDir, `${kind}-worker.wasm`));
    if (existsSync(wasmDir)) {
      for (const entry of readdirSync(wasmDir)) {
        if (entry.startsWith(`${kind}-worker.`) && entry.endsWith('.wasm')) {
          candidates.push(join(wasmDir, entry));
        }
      }
    }
  }
  const stagedAssets = join(WEB_ROOT, 'assets');
  if (existsSync(stagedAssets)) {
    candidates.push(join(stagedAssets, `${kind}-worker.dev-local.wasm`));
    for (const entry of readdirSync(stagedAssets)) {
      if (entry.startsWith(`${kind}-worker.`) && entry.endsWith('.wasm')) {
        candidates.push(join(stagedAssets, entry));
      }
    }
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolves the main `playground` wasm-bindgen directory.
 *
 * @param {string | null} wasmDir
 * @returns {string | null}
 */
function findMainPkgDir(wasmDir) {
  const candidates = [
    wasmDir ? join(wasmDir, 'pkg') : null,
    join(WEB_ROOT, 'assets/pkg'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (
      dir &&
      existsSync(join(dir, 'playground.js')) &&
      existsSync(join(dir, 'playground_bg.wasm'))
    ) {
      return dir;
    }
  }
  return null;
}

/**
 * Computes a deterministic content-derived `shell_build_id` (12 hex chars).
 *
 * @param {Array<{ name: string, bytes: Buffer }>} inputs
 * @returns {string}
 */
function computeShellBuildId(inputs) {
  const hash = createHash('sha256');
  const sorted = [...inputs].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  for (const item of sorted) {
    hash.update(item.name);
    hash.update('\0');
    hash.update(item.bytes);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/**
 * Stages a real, self-contained browser ESM `yjs.mjs` bundle into `legacyDir`.
 *
 * @param {string} legacyDir
 * @param {string | null} yjsBundlePath
 */
function stageLegacyYjsBundle(legacyDir, yjsBundlePath) {
  const dest = join(legacyDir, 'yjs.mjs');
  if (yjsBundlePath) {
    if (!existsSync(yjsBundlePath)) {
      throw new Error(`Missing --yjs-bundle file: ${yjsBundlePath}`);
    }
    copyFileSync(yjsBundlePath, dest);
    return;
  }

  const yjsEntry = join(REPO_ROOT, 'node_modules/yjs/dist/yjs.mjs');
  const esbuildBin = join(REPO_ROOT, 'node_modules/.bin/esbuild');
  if (existsSync(yjsEntry) && existsSync(esbuildBin)) {
    execFileSync(
      esbuildBin,
      [
        yjsEntry,
        '--bundle',
        '--format=esm',
        '--platform=browser',
        `--outfile=${dest}`,
      ],
      { stdio: 'pipe' }
    );
    return;
  }

  throw new Error(
    'Missing real yjs bundle for mobile-legacy. Pass --legacy-dir <dir>, --yjs-bundle <path>, or install repo node_modules (yjs + esbuild).'
  );
}

/**
 * Builds the fallback `mobile-legacy/index.html` and `mobile-legacy/app.js`
 * powered by real `yjs` (`Y.Doc` + `Y.applyUpdate` + `Y.encodeStateAsUpdate`)
 * when no external `--legacy-dir` bundle is supplied.
 *
 * @param {string} legacyDir
 * @param {string} shellBuildId
 * @param {string | null} yjsBundlePath
 */
function writeDefaultLegacyShell(legacyDir, shellBuildId, yjsBundlePath) {
  mkdirSync(legacyDir, { recursive: true });
  stageLegacyYjsBundle(legacyDir, yjsBundlePath);

  const legacyHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; base-uri 'none'; object-src 'none'"
    />
    <title>AFFiNE Mobile Legacy</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background: #f8fafc;
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #legacy-shell-root {
        max-width: 420px;
        margin: 0 auto;
        padding: 20px 16px 32px;
      }
      .legacy-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 18px;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
      }
      .legacy-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #fef3c7;
        color: #92400e;
        font-size: 12px;
        font-weight: 600;
      }
      h1 {
        margin: 12px 0 6px;
        font-size: 20px;
        line-height: 1.3;
      }
      p {
        margin: 6px 0;
        font-size: 14px;
        line-height: 1.5;
        color: #475569;
      }
      pre {
        margin: 12px 0 0;
        padding: 12px;
        border-radius: 10px;
        background: #0f172a;
        color: #f8fafc;
        font-size: 12px;
        line-height: 1.45;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .legacy-editor {
        margin-top: 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .legacy-editor label {
        font-size: 13px;
        font-weight: 600;
        color: #1e293b;
      }
      .legacy-editor select {
        width: 100%;
        box-sizing: border-box;
        min-height: 40px;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        font-family: inherit;
        font-size: 13px;
        color: #0f172a;
        background: #f8fafc;
      }
      .legacy-editor select:focus {
        outline: 2px solid #1e6efb;
        outline-offset: 1px;
        background: #ffffff;
      }
      .legacy-editor textarea {
        width: 100%;
        box-sizing: border-box;
        min-height: 58px;
        padding: 10px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.45;
        color: #0f172a;
        background: #f8fafc;
        resize: vertical;
      }
      .legacy-editor textarea:focus {
        outline: 2px solid #1e6efb;
        outline-offset: 1px;
        background: #ffffff;
      }
      .legacy-editor button {
        min-height: 44px;
        padding: 10px 14px;
        border: none;
        border-radius: 10px;
        background: #1e6efb;
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }
      .legacy-editor button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      #legacy-editor-status {
        margin: 0;
        font-size: 12px;
        color: #0f766e;
      }
      a.switch-link {
        display: inline-block;
        margin-top: 14px;
        color: #1e6efb;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main id="legacy-shell-root" data-shell="legacy" data-build-id="${shellBuildId}">
      <section class="legacy-card">
        <span class="legacy-badge">Legacy Fallback Shell</span>
        <h1>AFFiNE Mobile Legacy</h1>
        <p id="legacy-status">Ready (shell=legacy)</p>
        <p id="legacy-fallback-reason"></p>
        <pre id="legacy-recovered-doc">Checking same-origin IndexedDB...</pre>
        <div class="legacy-editor">
          <label for="legacy-target-doc">Target document</label>
          <select id="legacy-target-doc">
            <option value="">-- Select target document --</option>
          </select>
          <label for="legacy-editor-input">Append paragraph</label>
          <textarea
            id="legacy-editor-input"
            rows="2"
            placeholder="Write a paragraph to append..."
          ></textarea>
          <button id="legacy-append-btn" type="button">Append Paragraph</button>
          <p id="legacy-editor-status" aria-live="polite"></p>
        </div>
        <a class="switch-link" href="/?shell=native">Return to Native Shell</a>
      </section>
    </main>
    <script type="module" src="/mobile-legacy/app.js"></script>
  </body>
</html>
`;

  const legacyAppJs = `(async () => {
const Y = await import('/mobile-legacy/yjs.mjs');

function ensureLegacyShellDom() {
  if (document.getElementById('legacy-shell-root')) return;
  const style = document.createElement('style');
  style.textContent =
    'html,body{margin:0;padding:0;min-height:100%;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}' +
    '#legacy-shell-root{max-width:420px;margin:0 auto;padding:20px 16px 32px}' +
    '.legacy-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;box-shadow:0 4px 16px rgba(15,23,42,.06)}' +
    '.legacy-badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600}' +
    'h1{margin:12px 0 6px;font-size:20px;line-height:1.3}p{margin:6px 0;font-size:14px;line-height:1.5;color:#475569}' +
    'pre{margin:12px 0 0;padding:12px;border-radius:10px;background:#0f172a;color:#f8fafc;font-size:12px;line-height:1.45;overflow-x:auto;white-space:pre-wrap;word-break:break-word}' +
    '.legacy-editor{margin-top:14px;display:flex;flex-direction:column;gap:8px}' +
    '.legacy-editor label{font-size:13px;font-weight:600;color:#1e293b}' +
    '.legacy-editor select,.legacy-editor textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;font-family:inherit;font-size:13px;color:#0f172a;background:#f8fafc}' +
    '.legacy-editor button{min-height:44px;padding:10px 14px;border:none;border-radius:10px;background:#1e6efb;color:#fff;font-size:14px;font-weight:600;cursor:pointer}' +
    '.legacy-editor button:disabled{opacity:.6;cursor:not-allowed}' +
    '#legacy-editor-status{margin:0;font-size:12px;color:#0f766e}' +
    'a.switch-link{display:inline-block;margin-top:14px;color:#1e6efb;font-size:13px;font-weight:600;text-decoration:none}';
  document.head.append(style);
  const main = document.createElement('main');
  main.id = 'legacy-shell-root';
  main.dataset.shell = 'legacy';
  main.dataset.buildId = ${JSON.stringify(shellBuildId)};
  const card = document.createElement('section');
  card.className = 'legacy-card';
  const badge = document.createElement('span');
  badge.className = 'legacy-badge';
  badge.textContent = 'Legacy Fallback Shell';
  const h1 = document.createElement('h1');
  h1.textContent = 'AFFiNE Mobile Legacy';
  const statusP = document.createElement('p');
  statusP.id = 'legacy-status';
  statusP.textContent = 'Ready (shell=legacy)';
  const reasonP = document.createElement('p');
  reasonP.id = 'legacy-fallback-reason';
  const pre = document.createElement('pre');
  pre.id = 'legacy-recovered-doc';
  pre.textContent = 'Checking same-origin IndexedDB...';
  const editorDiv = document.createElement('div');
  editorDiv.className = 'legacy-editor';
  const selLabel = document.createElement('label');
  selLabel.htmlFor = 'legacy-target-doc';
  selLabel.textContent = 'Target document';
  const sel = document.createElement('select');
  sel.id = 'legacy-target-doc';
  const txtLabel = document.createElement('label');
  txtLabel.htmlFor = 'legacy-editor-input';
  txtLabel.textContent = 'Append paragraph';
  const textarea = document.createElement('textarea');
  textarea.id = 'legacy-editor-input';
  textarea.rows = 2;
  textarea.placeholder = 'Write a paragraph to append...';
  const btn = document.createElement('button');
  btn.id = 'legacy-append-btn';
  btn.type = 'button';
  btn.textContent = 'Append Paragraph';
  const edStatus = document.createElement('p');
  edStatus.id = 'legacy-editor-status';
  edStatus.setAttribute('aria-live', 'polite');
  editorDiv.append(selLabel, sel, txtLabel, textarea, btn, edStatus);
  const link = document.createElement('a');
  link.className = 'switch-link';
  link.href = '/?shell=native';
  link.textContent = 'Return to Native Shell';
  card.append(badge, h1, statusP, reasonP, pre, editorDiv, link);
  main.append(card);
  document.body.append(main);
}

const state = {
  shell: 'legacy',
  buildId: ${JSON.stringify(shellBuildId)},
  ready: false,
  fallbackReason: null,
  routeTarget: null,
  selectedTarget: null,
  recoveredDocs: [],
};

function resolveRouteTarget() {
  const params = new URLSearchParams(window.location.search);
  const explicitDb = (params.get('idb') || '').trim() || null;
  let pathWorkspaceId = null;
  let pathDocId = null;
  const pathMatch = window.location.pathname.match(
    /^\\/workspace\\/([^/]+)(?:\\/([^/]+))?\\/?$/
  );
  if (pathMatch) {
    try {
      pathWorkspaceId = decodeURIComponent(pathMatch[1] || '').trim() || null;
      pathDocId = pathMatch[2]
        ? decodeURIComponent(pathMatch[2]).trim() || null
        : null;
    } catch {
      pathWorkspaceId = (pathMatch[1] || '').trim() || null;
      pathDocId = (pathMatch[2] || '').trim() || null;
    }
  }
  const workspaceId =
    (params.get('workspace') || '').trim() || pathWorkspaceId || null;
  const docId =
    (params.get('doc') || params.get('docId') || '').trim() ||
    pathDocId ||
    null;
  const dbName =
    explicitDb || (workspaceId ? 'local:workspace:' + workspaceId : null);
  return { dbName, workspaceId, docId };
}

function encodeTargetKey(dbName, docId) {
  return JSON.stringify({ dbName, docId });
}

function decodeTargetKey(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.dbName === 'string' &&
      parsed.dbName &&
      typeof parsed.docId === 'string' &&
      parsed.docId
    ) {
      return { dbName: parsed.dbName, docId: parsed.docId };
    }
  } catch {
    // Ignore invalid option keys.
  }
  return null;
}

function readFallbackReason() {
  try {
    return (
      window.localStorage.getItem('affine:web-pref:shellFallbackReason') ||
      window.localStorage.getItem('shellFallbackReason') ||
      null
    );
  } catch {
    return null;
  }
}

function toBytes(raw) {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  return new Uint8Array(0);
}

function openDb(name, allowCreate = false) {
  return new Promise((resolve, reject) => {
    const req = allowCreate ? indexedDB.open(name, 3) : indexedDB.open(name);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('updates')) {
        db.createObjectStore('updates', { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('clocks')) {
        db.createObjectStore('clocks', { keyPath: 'docId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

function readAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
  });
}

function isPageVisibleNote(block) {
  if (!(block instanceof Y.Map)) return false;
  if (block.get('sys:flavour') !== 'affine:note') return false;
  if (block.get('prop:hidden') === true) return false;
  if (block.get('prop:displayMode') === 'edgeless') return false;
  return true;
}

function walkBlockSuiteTree(doc) {
  const blocks = doc.getMap('blocks');
  let pageId = null;
  const noteIds = [];
  const flavours = new Set();
  const paragraphs = [];
  const paragraphNodes = [];
  const childIds = [];

  blocks.forEach((block, id) => {
    if (!(block instanceof Y.Map)) return;
    const flavour = block.get('sys:flavour');
    if (typeof flavour === 'string') {
      flavours.add(flavour);
      if (flavour === 'affine:page' && !pageId) {
        pageId = id;
      }
    }
  });

  const visited = new Set();
  function walkChildren(parentId, depth) {
    if (depth > 64 || visited.has(parentId)) return;
    visited.add(parentId);
    const parent = blocks.get(parentId);
    const children = parent instanceof Y.Map ? parent.get('sys:children') : null;
    if (!(children instanceof Y.Array)) return;
    for (const cid of children.toArray()) {
      if (typeof cid !== 'string' || visited.has(cid)) continue;
      childIds.push(cid);
      const block = blocks.get(cid);
      if (block instanceof Y.Map) {
        const text = block.get('prop:text');
        if (text instanceof Y.Text) {
          const str = text.toString();
          paragraphs.push(str);
          paragraphNodes.push({ id: cid, depth, text: str });
        }
        walkChildren(cid, depth + 1);
      }
    }
  }

  if (pageId) {
    const page = blocks.get(pageId);
    const pageChildren = page instanceof Y.Map ? page.get('sys:children') : null;
    if (pageChildren instanceof Y.Array) {
      for (const cid of pageChildren.toArray()) {
        if (typeof cid !== 'string') continue;
        const candidate = blocks.get(cid);
        if (isPageVisibleNote(candidate)) {
          noteIds.push(cid);
          walkChildren(cid, 0);
        }
      }
    }
  }

  return {
    pageId,
    noteId: noteIds[0] || null,
    noteIds,
    childIds,
    flavours: [...flavours],
    paragraphs,
    paragraphNodes,
  };
}

async function loadDocFromIdb(dbName, docId) {
  const db = await openDb(dbName);
  try {
    const updates = await readAllFromStore(db, 'updates');
    const snapshots = await readAllFromStore(db, 'snapshots');
    const doc = new Y.Doc();
    let count = 0;
    for (const row of snapshots) {
      if ((row.id || row.docId) !== docId) continue;
      const bytes = toBytes(row.bin ?? row.data);
      if (bytes.byteLength > 0) {
        Y.applyUpdate(doc, bytes);
        count += 1;
      }
    }
    for (const row of updates) {
      if ((row.docId || row.id) !== docId) continue;
      const bytes = toBytes(row.bin ?? row.data);
      if (bytes.byteLength > 0) {
        Y.applyUpdate(doc, bytes);
        count += 1;
      }
    }
    return { doc, count };
  } finally {
    db.close();
  }
}

async function inspectRecoveredIdb() {
  const routeTarget = resolveRouteTarget();
  state.routeTarget = routeTarget;
  const dbNames = [];
  if (routeTarget.dbName) {
    dbNames.push(routeTarget.dbName);
  } else if (typeof indexedDB.databases === 'function') {
    try {
      const list = await indexedDB.databases();
      for (const item of list) {
        if (
          item &&
          typeof item.name === 'string' &&
          (item.name.startsWith('local:workspace:') ||
            item.name.startsWith('affine_'))
        ) {
          dbNames.push(item.name);
        }
      }
    } catch {
      // Ignore browsers without indexedDB.databases().
    }
  }

  const recovered = [];
  for (const dbName of dbNames) {
    let db = null;
    try {
      db = await openDb(dbName);
      const updates = await readAllFromStore(db, 'updates');
      const snapshots = await readAllFromStore(db, 'snapshots');
      const byDoc = new Map();
      for (const row of snapshots) {
        const docId = row.id || row.docId || 'unknown';
        if (!byDoc.has(docId)) byDoc.set(docId, []);
        byDoc.get(docId).push(toBytes(row.bin ?? row.data));
      }
      for (const row of updates) {
        const docId = row.docId || row.id || 'unknown';
        if (!byDoc.has(docId)) byDoc.set(docId, []);
        byDoc.get(docId).push(toBytes(row.bin ?? row.data));
      }
      for (const [docId, docUpdates] of byDoc.entries()) {
        const doc = new Y.Doc();
        let totalBytes = 0;
        for (const bytes of docUpdates) {
          if (bytes.byteLength > 0) {
            Y.applyUpdate(doc, bytes);
            totalBytes += bytes.byteLength;
          }
        }
        const tree = walkBlockSuiteTree(doc);
        recovered.push({
          dbName,
          docId,
          clientID: doc.clientID,
          updateCount: docUpdates.length,
          totalBytes,
          pageId: tree.pageId,
          noteId: tree.noteId,
          noteIds: tree.noteIds,
          childIds: tree.childIds,
          flavours: tree.flavours,
          paragraphs: tree.paragraphs,
          paragraphNodes: tree.paragraphNodes,
          text: tree.paragraphs.join(' | '),
        });
      }
    } catch {
      // Skip unreadable databases.
    } finally {
      if (db) {
        db.close();
      }
    }
  }
  return recovered;
}

function renderLegacyDom() {
  const statusEl = document.getElementById('legacy-status');
  if (statusEl) {
    statusEl.textContent = 'Active shell: mobile-legacy (' + state.buildId + ')';
  }
  const reasonEl = document.getElementById('legacy-fallback-reason');
  if (reasonEl && state.fallbackReason) {
    reasonEl.textContent = 'Fallback reason: ' + state.fallbackReason;
  }
  const docEl = document.getElementById('legacy-recovered-doc');
  if (docEl) {
    docEl.textContent =
      state.recoveredDocs.length > 0
        ? state.recoveredDocs
            .map(
              d =>
                '[' +
                d.dbName +
                '/' +
                d.docId +
                '] (' +
                d.updateCount +
                ' Yjs updates, ' +
                d.flavours.join(', ') +
                ')\\n' +
                d.paragraphNodes
                  .map(
                    (node, i) =>
                      '  ' +
                      '  '.repeat(node.depth) +
                      (i + 1) +
                      '. ' +
                      node.text
                  )
                  .join('\\n')
            )
            .join('\\n')
        : 'No pending local documents in IndexedDB.';
  }
}

function syncTargetSelector() {
  const selectEl = document.getElementById('legacy-target-doc');
  const btnEl = document.getElementById('legacy-append-btn');
  const route = state.routeTarget || resolveRouteTarget();
  const candidates = state.recoveredDocs.map(d => ({
    dbName: d.dbName,
    docId: d.docId,
    label: d.dbName + ' / ' + d.docId,
  }));

  if (
    route.dbName &&
    route.docId &&
    !candidates.some(
      c => c.dbName === route.dbName && c.docId === route.docId
    )
  ) {
    candidates.push({
      dbName: route.dbName,
      docId: route.docId,
      label: route.dbName + ' / ' + route.docId + ' (new)',
    });
  }

  let resolved = null;
  if (route.docId) {
    if (route.dbName) {
      resolved =
        candidates.find(
          c => c.dbName === route.dbName && c.docId === route.docId
        ) || null;
    } else {
      const matches = candidates.filter(c => c.docId === route.docId);
      if (matches.length === 1) {
        resolved = matches[0];
      }
    }
  } else if (
    state.selectedTarget &&
    candidates.some(
      c =>
        c.dbName === state.selectedTarget.dbName &&
        c.docId === state.selectedTarget.docId
    )
  ) {
    resolved = state.selectedTarget;
  } else if (candidates.length === 1) {
    resolved = candidates[0];
  }

  state.selectedTarget = resolved
    ? { dbName: resolved.dbName, docId: resolved.docId }
    : null;

  if (selectEl) {
    selectEl.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- Select target document --';
    selectEl.append(placeholder);
    for (const c of candidates) {
      const opt = document.createElement('option');
      opt.value = encodeTargetKey(c.dbName, c.docId);
      opt.textContent = c.label;
      selectEl.append(opt);
    }
    selectEl.value = state.selectedTarget
      ? encodeTargetKey(state.selectedTarget.dbName, state.selectedTarget.docId)
      : '';
  }
  if (btnEl) {
    btnEl.disabled = !state.selectedTarget;
  }
}

state.appendParagraphEdit = async (dbName, docId, text) => {
  const { doc } = await loadDocFromIdb(dbName, docId);
  const prevSv = Y.encodeStateVector(doc);
  const tree = walkBlockSuiteTree(doc);
  const blocks = doc.getMap('blocks');
  const paragraphId = 'para-legacy-' + doc.clientID + '-' + Date.now();
  doc.transact(() => {
    let targetNoteId =
      tree.noteIds.length > 0 ? tree.noteIds[tree.noteIds.length - 1] : null;
    if (!targetNoteId) {
      const pageId = tree.pageId || 'page-root';
      let page = blocks.get(pageId);
      if (!(page instanceof Y.Map)) {
        page = new Y.Map();
        page.set('sys:id', pageId);
        page.set('sys:flavour', 'affine:page');
        page.set('sys:children', new Y.Array());
        blocks.set(pageId, page);
      }
      let pageChildren = page.get('sys:children');
      if (!(pageChildren instanceof Y.Array)) {
        pageChildren = new Y.Array();
        page.set('sys:children', pageChildren);
      }
      targetNoteId = 'note-root';
      const note = new Y.Map();
      note.set('sys:id', targetNoteId);
      note.set('sys:flavour', 'affine:note');
      note.set('sys:children', new Y.Array());
      blocks.set(targetNoteId, note);
      pageChildren.push([targetNoteId]);
    }
    const note = blocks.get(targetNoteId);
    const noteChildren = note instanceof Y.Map ? note.get('sys:children') : null;
    if (!(noteChildren instanceof Y.Array)) {
      throw new Error('Cannot append paragraph: missing note sys:children Y.Array');
    }
    const para = new Y.Map();
    para.set('sys:id', paragraphId);
    para.set('sys:flavour', 'affine:paragraph');
    para.set('prop:type', 'text');
    const yText = new Y.Text();
    yText.insert(0, text);
    para.set('prop:text', yText);
    blocks.set(paragraphId, para);
    noteChildren.push([paragraphId]);
  });
  const delta = Y.encodeStateAsUpdate(doc, prevSv);

  const db = await openDb(dbName, true);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['updates', 'clocks'], 'readwrite');
      const createdAt = new Date();
      tx.objectStore('updates').add({ docId, createdAt, bin: delta });
      tx.objectStore('clocks').put({ docId, timestamp: createdAt });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
    });
  } finally {
    db.close();
  }

  state.lastEditClientID = doc.clientID;
  state.selectedTarget = { dbName, docId };
  state.recoveredDocs = await inspectRecoveredIdb();
  renderLegacyDom();
  syncTargetSelector();
  return {
    ok: true,
    clientID: doc.clientID,
    paragraphId,
    byteLength: delta.byteLength,
  };
};

function bindLegacyEditorUi() {
  const selectEl = document.getElementById('legacy-target-doc');
  const inputEl = document.getElementById('legacy-editor-input');
  const btnEl = document.getElementById('legacy-append-btn');
  const statusEl = document.getElementById('legacy-editor-status');
  if (!inputEl || !btnEl) return;

  selectEl?.addEventListener('change', () => {
    state.selectedTarget = decodeTargetKey(selectEl.value);
    btnEl.disabled = !state.selectedTarget;
    if (statusEl) {
      statusEl.textContent = state.selectedTarget
        ? 'Target: ' + state.selectedTarget.docId
        : 'Please select a target document first.';
    }
  });

  btnEl.addEventListener('click', async () => {
    const target =
      (selectEl ? decodeTargetKey(selectEl.value) : null) ||
      state.selectedTarget;
    if (!target) {
      if (statusEl) {
        statusEl.textContent = 'Please select a target document first.';
      }
      return;
    }
    const text = String(inputEl.value || '').trim();
    if (!text) {
      if (statusEl) statusEl.textContent = 'Enter text before appending.';
      return;
    }
    btnEl.disabled = true;
    try {
      const res = await state.appendParagraphEdit(
        target.dbName,
        target.docId,
        text
      );
      inputEl.value = '';
      if (statusEl) {
        statusEl.textContent =
          'Saved to ' +
          target.docId +
          ' (' +
          res.byteLength +
          ' B, client ' +
          res.clientID +
          ')';
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent =
          'Save failed: ' + (err instanceof Error ? err.message : String(err));
      }
    } finally {
      btnEl.disabled = !state.selectedTarget;
    }
  });
}

async function bootLegacyShell() {
  ensureLegacyShellDom();
  state.fallbackReason = readFallbackReason();
  state.recoveredDocs = await inspectRecoveredIdb();
  state.ready = true;
  window.__AFFINE_LEGACY_SHELL__ = state;
  renderLegacyDom();
  syncTargetSelector();
  bindLegacyEditorUi();
}

window.__AFFINE_LEGACY_SHELL__ = state;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void bootLegacyShell(), {
    once: true,
  });
} else {
  void bootLegacyShell();
}
})();
`;

  const assetsManifest = {
    publicPath: '/mobile-legacy/',
    css: [],
    js: ['app.js'],
    gitHash: shellBuildId,
    description: 'AFFiNE Mobile Legacy Fallback Shell',
  };

  writeFileSync(join(legacyDir, 'index.html'), legacyHtml);
  writeFileSync(join(legacyDir, 'app.js'), legacyAppJs);
  writeFileSync(
    join(legacyDir, 'assets-manifest.json'),
    JSON.stringify(assetsManifest, null, 2) + '\n'
  );
}

/**
 * Assembles the full hosted canary dual-shell `<static_root>/` directory.
 * Strictly requires real compiled Wasm binaries for all 4 preview workers and
 * the main `playground` package.
 *
 * @param {Object} options
 * @param {string} options.outDir
 * @param {string | null} [options.wasmDir]
 * @param {string | null} [options.buildId]
 * @param {string | null} [options.legacyDir]
 * @param {string | null} [options.yjsBundle]
 * @param {string | null} [options.desktopDir]
 */
export function stageCanaryDualShell(options) {
  const outDir = resolve(options.outDir);
  const wasmDir = options.wasmDir ? resolve(options.wasmDir) : null;
  const legacySrcDir = options.legacyDir ? resolve(options.legacyDir) : null;
  const yjsBundlePath = options.yjsBundle ? resolve(options.yjsBundle) : null;
  const desktopSrcDir = options.desktopDir ? resolve(options.desktopDir) : null;

  const mobileDir = join(outDir, 'mobile');
  const mobileSrcDir = join(mobileDir, 'src');
  const mobileWasmDir = join(mobileDir, 'wasm');
  const mobilePkgDir = join(mobileDir, 'pkg');
  const mobileFontsDir = join(mobileDir, 'assets/fonts');
  const mobileLegacyDir = join(outDir, 'mobile-legacy');

  // Collect source files & binary inputs for deterministic shell_build_id hashing.
  const srcFiles = listFilesSorted(join(WEB_ROOT, 'src'));
  /** @type {Array<{ name: string, bytes: Buffer }>} */
  const hashInputs = srcFiles.map(file => ({
    name: `src/${relative(join(WEB_ROOT, 'src'), file)}`,
    bytes: readFileSync(file),
  }));

  /** @type {Record<string, { src: string, bytes: Buffer }>} */
  const workerBins = {};
  for (const kind of WORKER_KINDS) {
    const found = findWorkerWasm(wasmDir, kind);
    if (!found) {
      throw new Error(
        `Missing real compiled preview worker wasm for "${kind}". Build blocksuite-preview and pass --wasm-dir <dir>.`
      );
    }
    const bytes = readFileSync(found);
    validateRealWasmBinary(
      `${kind}-worker.wasm`,
      bytes,
      PREVIEW_WORKER_REQUIRED_EXPORTS
    );
    workerBins[kind] = { src: found, bytes };
    hashInputs.push({ name: `wasm/${kind}.wasm`, bytes });
  }

  const mainPkgSrc = findMainPkgDir(wasmDir);
  if (!mainPkgSrc) {
    throw new Error(
      'Missing real compiled playground wasm-bindgen package (pkg/playground.js + pkg/playground_bg.wasm). Build playground and pass --wasm-dir <dir>.'
    );
  }
  const mainPkgJsBytes = readFileSync(join(mainPkgSrc, 'playground.js'));
  const mainPkgWasmBytes = readFileSync(join(mainPkgSrc, 'playground_bg.wasm'));
  const mainPkgJsText = mainPkgJsBytes.toString('utf8');
  for (const sym of PLAYGROUND_REQUIRED_EXPORTS) {
    if (!mainPkgJsText.includes(sym)) {
      throw new Error(
        `Invalid pkg/playground.js: missing required export "${sym}".`
      );
    }
  }
  validateRealWasmBinary(
    'pkg/playground_bg.wasm',
    mainPkgWasmBytes,
    PLAYGROUND_REQUIRED_EXPORTS
  );
  hashInputs.push({ name: 'pkg/playground.js', bytes: mainPkgJsBytes });
  hashInputs.push({ name: 'pkg/playground_bg.wasm', bytes: mainPkgWasmBytes });

  /** @type {Array<{ key: string, prefix: string, src: string, bytes: Buffer }>} */
  const fontBins = [];
  for (const spec of FONT_SPECS) {
    if (!existsSync(spec.src)) {
      throw new Error(`Missing tracked font source: ${spec.src}`);
    }
    const bytes = readFileSync(spec.src);
    fontBins.push({ ...spec, bytes });
    hashInputs.push({ name: `fonts/${spec.prefix}.ttf`, bytes });
  }

  const shellBuildId =
    (options.buildId && options.buildId.trim()) ||
    computeShellBuildId(hashInputs);

  // Prepare clean mobile & mobile-legacy output directories.
  rmSync(mobileDir, { recursive: true, force: true });
  rmSync(mobileLegacyDir, { recursive: true, force: true });
  mkdirSync(mobileSrcDir, { recursive: true });
  mkdirSync(mobileWasmDir, { recursive: true });
  mkdirSync(mobilePkgDir, { recursive: true });
  mkdirSync(mobileFontsDir, { recursive: true });

  // 1. Copy desktop shell or create a minimal desktop placeholder.
  if (desktopSrcDir && existsSync(desktopSrcDir)) {
    cpSync(desktopSrcDir, outDir, { recursive: true });
  } else if (!existsSync(join(outDir, 'index.html'))) {
    mkdirSync(join(outDir, 'assets'), { recursive: true });
    writeFileSync(
      join(outDir, 'index.html'),
      `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>AFFiNE Desktop</title></head><body><div id="app" data-shell="desktop"></div><script src="/assets/desktop.js"></script></body></html>\n`
    );
    writeFileSync(
      join(outDir, 'assets/desktop.js'),
      'window.__AFFINE_DESKTOP_SHELL__ = true;\n'
    );
  }

  // 2. Stage mobile/src/**.
  cpSync(join(WEB_ROOT, 'src'), mobileSrcDir, { recursive: true });

  // 3. Stage content-hash-locked worker wasm binaries under mobile/wasm/.
  /** @type {Record<string, { script: string, wasm: string, sha256: string, bytes: number }>} */
  const manifestWorkers = {};
  /** @type {Record<string, { script: string, wasm: string }>} */
  const htmlWorkers = {};
  for (const kind of WORKER_KINDS) {
    const fileName = `${kind}-worker.${shellBuildId}.wasm`;
    const dst = join(mobileWasmDir, fileName);
    writeFileSync(dst, workerBins[kind].bytes);
    htmlWorkers[kind] = {
      script: `/src/workers/${kind}-worker.js`,
      wasm: `/wasm/${fileName}`,
    };
    manifestWorkers[kind] = {
      script: `/mobile/src/workers/${kind}-worker.js`,
      wasm: `/mobile/wasm/${fileName}`,
      sha256: sha256Hex(workerBins[kind].bytes),
      bytes: workerBins[kind].bytes.byteLength,
    };
  }

  // 4. Stage main playground wasm-bindgen bundle under mobile/pkg/.
  writeFileSync(join(mobilePkgDir, 'playground.js'), mainPkgJsBytes);
  writeFileSync(join(mobilePkgDir, 'playground_bg.wasm'), mainPkgWasmBytes);
  if (existsSync(join(mainPkgSrc, 'snippets'))) {
    cpSync(join(mainPkgSrc, 'snippets'), join(mobilePkgDir, 'snippets'), {
      recursive: true,
    });
  }

  // 5. Stage content-hash-locked fonts under mobile/assets/fonts/.
  /** @type {Record<string, string>} */
  const htmlFonts = {};
  /** @type {Record<string, { url: string, sha256: string, bytes: number }>} */
  const manifestFonts = {};
  for (const font of fontBins) {
    const fileName = `${font.prefix}.${shellBuildId}.ttf`;
    copyFileSync(font.src, join(mobileFontsDir, fileName));
    htmlFonts[font.key] = `/assets/fonts/${fileName}`;
    manifestFonts[font.key] = {
      url: `/mobile/assets/fonts/${fileName}`,
      sha256: sha256Hex(font.bytes),
      bytes: font.bytes.byteLength,
    };
  }

  // 6. Rewrite mobile/index.html with locked shell_build_id and cookie-immune /mobile/ assetBaseUrl.
  const rawIndexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
  const embeddedManifest = {
    shellVersion: 'mobile-v1',
    shell_build_id: shellBuildId,
    buildId: shellBuildId,
    buildHash: shellBuildId,
    assetBaseUrl: '/mobile/',
    appEntryJs: '/src/default-app-entry.js',
    mainWasmJs: '/pkg/playground.js',
    workers: htmlWorkers,
    fonts: htmlFonts,
  };
  const stagedIndexHtml = rawIndexHtml
    .replace(
      /<script id="affine-build-manifest" type="application\/json">[\s\S]*?<\/script>/,
      `<script id="affine-build-manifest" type="application/json">\n${JSON.stringify(
        embeddedManifest,
        null,
        2
      )}\n    </script>`
    )
    .replace(
      '<script type="module" src="/src/host.js"></script>',
      '<script type="module" src="/mobile/src/host.js"></script>'
    );
  writeFileSync(join(mobileDir, 'index.html'), stagedIndexHtml);

  // 7. Rewrite mobile/sign-in.html with cookie-immune /mobile/src/sign-in.js.
  const rawSignInHtml = readFileSync(join(WEB_ROOT, 'sign-in.html'), 'utf8');
  const stagedSignInHtml = rawSignInHtml.replace(
    '<script type="module" src="/src/sign-in.js"></script>',
    '<script type="module" src="/mobile/src/sign-in.js"></script>'
  );
  writeFileSync(join(mobileDir, 'sign-in.html'), stagedSignInHtml);

  // 8. Stage mobile-legacy/ fallback shell.
  if (legacySrcDir && existsSync(legacySrcDir)) {
    cpSync(legacySrcDir, mobileLegacyDir, { recursive: true });
  } else {
    writeDefaultLegacyShell(mobileLegacyDir, shellBuildId, yjsBundlePath);
  }

  // 9. Write structured release manifest.
  const releaseManifest = {
    schemaVersion: 1,
    shellVersion: 'mobile-v1',
    shell_build_id: shellBuildId,
    assetBaseUrl: '/mobile/',
    legacyBaseUrl: '/mobile-legacy/',
    pkg: {
      js: '/mobile/pkg/playground.js',
      wasm: '/mobile/pkg/playground_bg.wasm',
      jsSha256: sha256Hex(mainPkgJsBytes),
      wasmSha256: sha256Hex(mainPkgWasmBytes),
    },
    workers: manifestWorkers,
    fonts: manifestFonts,
  };
  writeFileSync(
    join(mobileDir, 'release-manifest.json'),
    JSON.stringify(releaseManifest, null, 2) + '\n'
  );

  return {
    outDir,
    shellBuildId,
    mobileDir,
    mobileLegacyDir,
    releaseManifest,
  };
}

function parseCliArgs(argv) {
  /** @type {Record<string, string>} */
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (
      token === '--out' ||
      token === '--wasm-dir' ||
      token === '--build-id' ||
      token === '--legacy-dir' ||
      token === '--yjs-bundle' ||
      token === '--desktop-dir'
    ) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${token}`);
      }
      args[token.slice(2)] = next;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const cli = parseCliArgs(process.argv.slice(2));
  if (typeof cli.out !== 'string' || !cli.out.trim()) {
    console.error(
      'Usage: node stage-canary-dual-shell.mjs --out <static_root> --wasm-dir <dir> [--build-id <id>] [--legacy-dir <dir>] [--yjs-bundle <path>] [--desktop-dir <dir>]'
    );
    process.exit(1);
  }
  const result = stageCanaryDualShell({
    outDir: cli.out,
    wasmDir: typeof cli['wasm-dir'] === 'string' ? cli['wasm-dir'] : null,
    buildId: typeof cli['build-id'] === 'string' ? cli['build-id'] : null,
    legacyDir: typeof cli['legacy-dir'] === 'string' ? cli['legacy-dir'] : null,
    yjsBundle: typeof cli['yjs-bundle'] === 'string' ? cli['yjs-bundle'] : null,
    desktopDir:
      typeof cli['desktop-dir'] === 'string' ? cli['desktop-dir'] : null,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: result.outDir,
        shell_build_id: result.shellBuildId,
        workers: Object.keys(result.releaseManifest.workers),
        fonts: Object.keys(result.releaseManifest.fonts),
      },
      null,
      2
    )
  );
}
