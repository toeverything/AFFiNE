#!/usr/bin/env node
// @ts-check

/**
 * Real-browser Headless Chromium E2E gate for S3-Web thin host capabilities.
 *
 * Loads the production `index.html` + `src/host.js` + `src/default-app-entry.js`
 * directly in a preinstalled Chromium binary (never runs `playwright install`)
 * and always stops the browser process by its exact PID inside `finally`.
 *
 * Verifies in real Chromium (`390x844` mobile viewport @ 2x DPR):
 *   1. Production `index.html` boot removes `#boot` after first WebGL2 frame,
 *      with 0 `pdf-worker.wasm` requests at boot.
 *   2. `WEBGL_lose_context` recovery on real `#app-canvas` (`webglcontextlost`
 *      calls `preventDefault()`, pauses input; `webglcontextrestored` rebuilds
 *      and redraws without reload).
 *   3. Post-boot `fallback-blocked` recreates `#boot` with visible error text
 *      and clickable `#gpu-fallback-retry` button; clicking `#gpu-fallback-retry`
 *      after IDB recovers flushes pending writes and triggers a single fallback.
 *   4. Touch and pointer selection overlay on real `index.html` `#app-canvas`:
 *      touch `pointerdown` does not fire action, slide-off cancels, touch
 *      `pointerup` fires `Copy` / `Cut` / `Paste` (Cut preserves text on write
 *      failure), with zero floating DOM nodes.
 *   5. Lazy `hayro` `pdf-worker.wasm` multi-page render with distinct scales
 *      (`0.5`, `1`, `2`), lightweight `page_count`, transfer-safe LRU cache,
 *      and WebGL2 texture compositing onto `#app-canvas`.
 *
 * Pass `--out-dir <dir>` to capture `web-selection-menu.png` and
 * `web-pdf-worker-preview.png` directly from production `index.html`.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
};

function parseOutDir() {
  const idx = process.argv.indexOf('--out-dir');
  if (idx >= 0 && process.argv[idx + 1]) {
    return resolve(process.argv[idx + 1]);
  }
  return null;
}

function isSnapWrapper(bin) {
  if (!bin.startsWith('/usr/bin/chromium')) {
    return false;
  }
  try {
    const fd = openSync(bin, 'r');
    try {
      const buf = Buffer.alloc(256);
      const n = readSync(fd, buf, 0, buf.length, 0);
      const head = buf.subarray(0, n).toString('utf8');
      return head.startsWith('#!') && /snap/i.test(head);
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

function findChromiumBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  let snapFallback = null;
  for (const bin of candidates) {
    if (!bin || !existsSync(bin)) {
      continue;
    }
    if (isSnapWrapper(bin)) {
      snapFallback ??= bin;
      continue;
    }
    return bin;
  }
  const pwDir = join(process.env.HOME || '', '.cache/ms-playwright');
  if (existsSync(pwDir)) {
    const found = execFileSync(
      'find',
      [pwDir, '-name', 'chrome', '-type', 'f'],
      { encoding: 'utf8' }
    )
      .split('\n')
      .map(line => line.trim())
      .find(Boolean);
    if (found) {
      return found;
    }
  }
  if (snapFallback) {
    return snapFallback;
  }
  throw new Error('No preinstalled Chromium binary found on this machine');
}

function ensureStagedPdfWasm() {
  const target = join(WEB_ROOT, 'assets/pdf-worker.dev-local.wasm');
  if (!existsSync(target)) {
    throw new Error(
      `Missing staged pdf-worker wasm: ${target}. Run stage-preview-workers.mjs first.`
    );
  }
}

ensureStagedPdfWasm();

const outDir = parseOutDir();
if (outDir) {
  mkdirSync(outDir, { recursive: true });
}

let wasmRequestCount = 0;

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname.includes('pdf-worker') && url.pathname.endsWith('.wasm')) {
    wasmRequestCount += 1;
  }
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const rel = normalize(pathname).replace(/^\/+/, '');
  const full = resolve(WEB_ROOT, rel);
  if (!full.startsWith(WEB_ROOT) || !existsSync(full)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME_TYPES[extname(full)] || 'application/octet-stream',
  });
  res.end(readFileSync(full));
});

const chromeBin = findChromiumBinary();
const profileDir = mkdtempSync(join(tmpdir(), 'affine-s3-web-e2e-'));
await new Promise(resolveListen =>
  server.listen(0, '127.0.0.1', resolveListen)
);
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;

const chromeProc = spawn(
  chromeBin,
  [
    '--headless=new',
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

let ws = null;
try {
  const wsUrl = await new Promise((resolveWs, rejectWs) => {
    let stderrBuf = '';
    const timer = setTimeout(
      () => rejectWs(new Error(`Chromium DevTools timeout: ${stderrBuf}`)),
      15000
    );
    chromeProc.stderr.on('data', chunk => {
      stderrBuf += String(chunk);
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolveWs(m[1]);
      }
    });
    chromeProc.once('exit', code => {
      clearTimeout(timer);
      rejectWs(new Error(`Chromium exited early (${code}): ${stderrBuf}`));
    });
  });

  const debugPort = new URL(wsUrl).port;
  const targets = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  ).json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', fail, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message));
      else ok(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        fail(new Error(`CDP timeout after 25s for ${method}`));
      }, 25000);
      pending.set(id, {
        ok: val => {
          clearTimeout(timer);
          ok(val);
        },
        fail: err => {
          clearTimeout(timer);
          fail(err);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJs = async expression => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text
      );
    }
    return r.result?.value;
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: false });

  // Load production index.html directly.
  await send('Page.navigate', {
    url: `http://127.0.0.1:${port}/index.html`,
  });

  let booted = false;
  for (let i = 0; i < 100; i += 1) {
    booted = Boolean(
      await evalJs(
        'Boolean(window.__AFFINE_WEB_HOST__ && window.__AFFINE_WEB_HOST__.selectionOverlay && !document.getElementById("boot"))'
      )
    );
    if (booted) break;
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal(booted, true, 'Production index.html did not finish boot');
  assert.equal(
    wasmRequestCount,
    0,
    'pdf-worker.wasm must not be requested during boot'
  );

  // 1. Real WEBGL_lose_context recovery on production #app-canvas.
  const webglRecovery = await evalJs(`(async () => {
    const host = window.__AFFINE_WEB_HOST__;
    const canvas = host.canvas;
    const gl = canvas.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!gl || !ext) {
      return { ok: false, reason: 'no-webgl2' };
    }
    let lostPrevented = false;
    const lostP = new Promise(resolve => {
      canvas.addEventListener('webglcontextlost', ev => {
        lostPrevented = ev.defaultPrevented;
        resolve({
          status: host.gpuRecovery.getState().status,
          inputPaused: host.isInputPaused(),
          imeReadOnly: host.ime.readOnly,
        });
      }, { once: true });
    });
    const restoredP = new Promise(resolve => {
      canvas.addEventListener('webglcontextrestored', () => {
        setTimeout(() => {
          resolve({
            status: host.gpuRecovery.getState().status,
            inputPaused: host.isInputPaused(),
            imeReadOnly: host.ime.readOnly,
            restoreCount: host.gpuRecovery.getState().restoreCount,
          });
        }, 50);
      }, { once: true });
    });
    ext.loseContext();
    const duringLost = await lostP;
    await new Promise(r => setTimeout(r, 0));
    ext.restoreContext();
    const afterRestore = await restoredP;
    return { ok: true, lostPrevented, duringLost, afterRestore };
  })()`);
  assert.equal(webglRecovery.ok, true);
  assert.equal(webglRecovery.lostPrevented, true);
  assert.equal(webglRecovery.duringLost.status, 'context-lost');
  assert.equal(webglRecovery.duringLost.inputPaused, true);
  assert.equal(webglRecovery.afterRestore.status, 'ready');
  assert.equal(webglRecovery.afterRestore.inputPaused, false);
  assert.ok(webglRecovery.afterRestore.restoreCount >= 1);

  // 2. Post-boot fallback-blocked recreates #boot with visible message and clickable #gpu-fallback-retry.
  const blockedRetry = await evalJs(`(async () => {
    const { createGpuRecoveryController, hideRuntimeFatal, showBootFatal } = await import('/src/host.js');
    const { createIdbWorkspaceStorage, createPendingWriteFlusher } = await import('/src/idb-storage.js');

    const storage = createIdbWorkspaceStorage({
      flavour: 'local',
      type: 'workspace',
      id: 's3-web-retry-e2e',
    });
    const flusher = createPendingWriteFlusher(storage);
    flusher.enqueue({
      docId: 'doc-unsaved-r2',
      bin: new TextEncoder().encode('crdt-delta-r2'),
    });

    let allowFlush = false;
    const navUrls = [];
    const ctrl = createGpuRecoveryController({
      getHref: () => 'https://app.affine.pro/workspace/ws-1/doc-unsaved-r2?code=once&tab=notes',
      isOAuthCodeConsumed: () => true,
      pauseInput: () => { window.__AFFINE_WEB_HOST__.ime.readOnly = true; },
      resumeInput: () => { window.__AFFINE_WEB_HOST__.ime.readOnly = false; },
      flushPendingWrites: async () => {
        if (!allowFlush) {
          throw new Error('simulated-idb-quota-error');
        }
        return flusher.flush();
      },
      navigate: url => navUrls.push(url),
      showFatal: (msg, opts) =>
        showBootFatal(document, msg, {
          retryable: Boolean(opts?.retryable),
          onRetry: opts?.retryable ? () => ctrl.retryFallback() : undefined,
        }),
      hideFatal: () => hideRuntimeFatal(document),
    });

    const bootBefore = Boolean(document.getElementById('boot'));
    const blockedRes = await ctrl.triggerFallback('context-restore-timeout');
    const bootWhileBlocked = document.getElementById('boot');
    const msgWhileBlocked = document.getElementById('boot-message')?.textContent || '';
    const retryBtn = document.getElementById('gpu-fallback-retry');
    const pendingWhileBlocked = flusher.pendingCount();

    allowFlush = true;
    retryBtn?.click();
    for (let i = 0; i < 40 && navUrls.length === 0; i += 1) {
      await new Promise(r => setTimeout(r, 25));
    }

    hideRuntimeFatal(document);
    const bootAfterRetry = Boolean(document.getElementById('boot'));
    const persisted = await storage.getDocRaw('doc-unsaved-r2');
    storage.close();
    await new Promise(resolve => {
      const req = indexedDB.deleteDatabase(storage.dbName);
      req.onsuccess = resolve;
      req.onerror = resolve;
    });
    window.__AFFINE_WEB_HOST__.ime.readOnly = false;

    return {
      bootBefore,
      blockedRes,
      hasBootWhileBlocked: Boolean(bootWhileBlocked),
      msgWhileBlocked,
      hasRetryBtn: Boolean(retryBtn),
      pendingWhileBlocked,
      bootAfterRetry,
      navUrls,
      persistedUpdates: persisted?.updates.length ?? 0,
    };
  })()`);
  assert.equal(blockedRetry.bootBefore, false);
  assert.equal(blockedRetry.blockedRes.navigated, false);
  assert.equal(blockedRetry.blockedRes.retryable, true);
  assert.equal(blockedRetry.hasBootWhileBlocked, true);
  assert.ok(blockedRetry.msgWhileBlocked.includes('Retry'));
  assert.equal(blockedRetry.hasRetryBtn, true);
  assert.equal(blockedRetry.pendingWhileBlocked, 1);
  assert.equal(blockedRetry.bootAfterRetry, false);
  assert.equal(blockedRetry.persistedUpdates, 1);
  assert.equal(blockedRetry.navUrls.length, 1);
  assert.equal(
    new URL(blockedRetry.navUrls[0]).searchParams.get('shell'),
    'legacy'
  );
  assert.equal(
    new URL(blockedRetry.navUrls[0]).searchParams.has('code'),
    false
  );

  // 3. Inject test document + selection overlay onto production index.html #app-canvas.
  const selSetup = await evalJs(`(() => {
    const host = window.__AFFINE_WEB_HOST__;
    window.__S3_SEL_STATE__ = {
      docBody: 'The thin web host draws every selection highlight, teardrop handle',
      clipboardText: '',
      failNextClipboard: false,
      actions: [],
    };
    const clipboardMock = {
      async writeText(text) {
        if (window.__S3_SEL_STATE__.failNextClipboard) {
          throw new Error('ClipboardDenied');
        }
        window.__S3_SEL_STATE__.clipboardText = text;
      },
      async readText() {
        return window.__S3_SEL_STATE__.clipboardText;
      },
    };
    host.selectionOverlay.setScene({
      theme: 'light',
      paint(ctx, vw, vh) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, vw, vh);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, vw, 96);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 95, vw, 1);
        ctx.fillStyle = '#0f172a';
        ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('9:41', 22, 30);
        ctx.font = '700 17px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('AFFiNE Mobile Spec', 22, 74);
        ctx.fillStyle = '#1e6efb';
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('Canvas Host', 292, 74);
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('Pure Canvas Selection', 24, 142);
        const lines = [
          'The thin web host draws every selection',
          'highlight, teardrop handle, and action bar',
          'directly on #app-canvas with zero floating',
          'DOM menus or third-party JavaScript.',
        ];
        ctx.font = '400 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = '#1e293b';
        [232, 262, 292, 322].forEach((y, i) => ctx.fillText(lines[i], 24, y));
        ctx.fillStyle = '#64748b';
        ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('DOM check: 0 floating menu elements mounted', 24, 412);
      },
      selection: {
        viewport: { width: 390, height: 844, safeArea: { top: 44, bottom: 34 } },
        rects: [
          { x: 24, y: 214, width: 312, height: 26 },
          { x: 24, y: 244, width: 326, height: 26 },
        ],
        caretStart: { x: 24, y: 214, height: 26, dir: 'ltr' },
        caretEnd: { x: 350, y: 244, height: 26, dir: 'ltr' },
      },
      callbacks: {
        getSelectedText: () => 'highlight, teardrop handle',
        getSelectionToken: () => 'spec-doc:24,214:350,244',
        deleteSelection: () => {
          window.__S3_SEL_STATE__.docBody = window.__S3_SEL_STATE__.docBody.replace(
            ' highlight, teardrop handle',
            ''
          );
        },
        insertText: text => {
          window.__S3_SEL_STATE__.docBody += ' ' + text;
        },
        selectAll: () => {},
        clipboard: clipboardMock,
        isSecureContext: true,
        onActionResult: res => window.__S3_SEL_STATE__.actions.push(res),
      },
    });
    const layout = host.selectionOverlay.getLayout();
    const copyBtn = layout.menu.items.find(i => i.id === 'copy');
    const cutBtn = layout.menu.items.find(i => i.id === 'cut');
    const pasteBtn = layout.menu.items.find(i => i.id === 'paste');
    const bodyChildIds = [...document.body.children]
      .filter(el => el.tagName !== 'SCRIPT')
      .map(el => el.tagName.toLowerCase() + '#' + el.id);
    return {
      copyPt: { x: copyBtn.x + copyBtn.width / 2, y: copyBtn.y + copyBtn.height / 2 },
      cutPt: { x: cutBtn.x + cutBtn.width / 2, y: cutBtn.y + cutBtn.height / 2 },
      pastePt: { x: pasteBtn.x + pasteBtn.width / 2, y: pasteBtn.y + pasteBtn.height / 2 },
      menuX: layout.menu.x,
      menuRightMargin: 390 - (layout.menu.x + layout.menu.width),
      bodyChildIds,
      embedLayerChildren: document.getElementById('embed-layer').children.length,
      imeFontSize: getComputedStyle(host.ime).fontSize,
    };
  })()`);

  assert.deepEqual(selSetup.bodyChildIds, [
    'canvas#app-canvas',
    'textarea#ime',
    'div#safe-area-probe',
    'div#embed-layer',
    'div#a11y-tree',
  ]);
  assert.equal(selSetup.embedLayerChildren, 0);
  assert.equal(selSetup.imeFontSize, '16px');
  assert.ok(selSetup.menuX >= 12);
  assert.ok(selSetup.menuRightMargin >= 12);

  if (outDir) {
    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(
      join(outDir, 'web-selection-menu.png'),
      Buffer.from(shot1.data, 'base64')
    );
  }

  // Real touch gestures via CDP: touchStart on Copy must NOT fire; sliding off cancels.
  await send('Page.bringToFront');
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [selSetup.copyPt],
  });
  const afterTouchDown = await evalJs('window.__S3_SEL_STATE__.actions.length');
  assert.equal(
    afterTouchDown,
    0,
    'touch pointerdown must not fire menu action'
  );

  await send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 10, y: 780 }],
  });
  await send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  const afterSlideCancel = await evalJs(
    'window.__S3_SEL_STATE__.actions.length'
  );
  assert.equal(afterSlideCancel, 0, 'slide-off touchEnd must cancel action');

  // Real touch tap on Copy fires on pointerup.
  const touchTap = async pt => {
    await send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [pt],
    });
    await send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await new Promise(r => setTimeout(r, 80));
  };
  await touchTap(selSetup.copyPt);
  const clipAfterCopy = await evalJs('window.__S3_SEL_STATE__.clipboardText');
  assert.equal(clipAfterCopy, 'highlight, teardrop handle');

  // Failing Cut (both async clipboard and execCommand fallback rejected) preserves document text.
  await evalJs(`(() => {
    window.__S3_SEL_STATE__.failNextClipboard = true;
    window.__S3_ORIG_EXEC_CMD__ = document.execCommand;
    document.execCommand = () => false;
  })()`);
  await touchTap(selSetup.cutPt);
  const bodyAfterFailedCut = await evalJs('window.__S3_SEL_STATE__.docBody');
  assert.ok(bodyAfterFailedCut.includes('highlight, teardrop handle'));

  await evalJs(`(() => {
    window.__S3_SEL_STATE__.failNextClipboard = false;
    document.execCommand = window.__S3_ORIG_EXEC_CMD__;
  })()`);
  await touchTap(selSetup.cutPt);
  const bodyAfterOkCut = await evalJs('window.__S3_SEL_STATE__.docBody');
  assert.equal(bodyAfterOkCut.includes('highlight, teardrop handle'), false);

  await touchTap(selSetup.pastePt);
  const bodyAfterPaste = await evalJs('window.__S3_SEL_STATE__.docBody');
  assert.ok(bodyAfterPaste.includes('highlight, teardrop handle'));

  // Still zero pdf-worker.wasm requests before PDF opens!
  assert.equal(wasmRequestCount, 0);

  // 4. Lazy hayro pdf-worker.wasm multi-page & multi-scale render onto production index.html #app-canvas.
  const pdfResult = await evalJs(`(async () => {
    const host = window.__AFFINE_WEB_HOST__;
    const spawnedBefore = host.workerLoader.hasLoadedWorker('pdf');

    function buildMultiPagePdf() {
      const s1 = [
        '0.98 0.99 1.00 rg 0 0 360 480 re f',
        '0.12 0.35 0.85 rg 0 416 360 64 re f',
        'BT /F1 18 Tf 1 1 1 rg 24 442 Td (AFFiNE Mobile Architecture) Tj ET',
        'BT /F1 11 Tf 0.85 0.92 1.00 rg 24 424 Td (Pure Safe Rust hayro PDF Worker - Page 1 of 2) Tj ET',
        '0.92 0.95 1.00 rg 24 270 312 120 re f',
        '0.12 0.35 0.85 RG 1.2 w 24 270 312 120 re S',
        'BT /F1 13 Tf 0.10 0.14 0.22 rg 38 366 Td (Quarterly Frame Time Budget) Tj ET',
        '0.15 0.50 0.95 rg 46 284 42 52 re f',
        '0.18 0.68 0.56 rg 108 284 42 64 re f',
        '0.94 0.58 0.16 rg 170 284 42 44 re f',
        '0.44 0.36 0.90 rg 232 284 42 58 re f',
        'BT /F1 11 Tf 0.18 0.22 0.30 rg 24 236 Td (1. Zero third-party runtime JavaScript in Web host.) Tj ET',
        'BT /F1 11 Tf 0.18 0.22 0.30 rg 24 214 Td (2. Lazy pdf-worker.wasm spawns only on PDF open.) Tj ET',
        'BT /F1 11 Tf 0.18 0.22 0.30 rg 24 192 Td (3. Transferable RGBA frames with LRU byte cap.) Tj ET',
        '0.86 0.89 0.94 RG 0.8 w 24 156 m 336 156 l S',
        'BT /F1 10 Tf 0.38 0.44 0.54 rg 24 132 Td (Rendered off the main thread by hayro in WebAssembly.) Tj ET',
        '0.12 0.35 0.85 rg 24 72 96 28 re f',
        'BT /F1 10 Tf 1 1 1 rg 40 82 Td (VERIFIED) Tj ET',
      ].join('\\n') + '\\n';
      const s2 = [
        '0.99 0.99 1.00 rg 0 0 360 480 re f',
        '0.15 0.55 0.45 rg 0 416 360 64 re f',
        'BT /F1 18 Tf 1 1 1 rg 24 442 Td (Appendix - Page 2 of 2) Tj ET',
        '0.15 0.55 0.45 rg 40 240 280 120 re f',
      ].join('\\n') + '\\n';
      const objects = [
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\\n',
        '2 0 obj << /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >> endobj\\n',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >> endobj\\n',
        '4 0 obj << /Length ' + s1.length + ' >> stream\\n' + s1 + 'endstream endobj\\n',
        '5 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >> endobj\\n',
        '6 0 obj << /Length ' + s2.length + ' >> stream\\n' + s2 + 'endstream endobj\\n',
        '7 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\\n',
      ];
      let out = '%PDF-1.4\\n';
      const offsets = [0];
      for (const obj of objects) {
        offsets.push(out.length);
        out += obj;
      }
      const xrefPos = out.length;
      out += 'xref\\n0 ' + (objects.length + 1) + '\\n0000000000 65535 f \\n';
      for (let i = 1; i < offsets.length; i += 1) {
        out += String(offsets[i]).padStart(10, '0') + ' 00000 n \\n';
      }
      out += 'trailer << /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\\nstartxref\\n' + xrefPos + '\\n%%EOF\\n';
      return new TextEncoder().encode(out);
    }

    const pdfBytes = buildMultiPagePdf();
    const pageCount = await host.pdfClient.getPageCount({ docKey: 'r2-pdf', pdfBytes });
    const [pHalf, p1a, p1b, p2x] = await Promise.all([
      host.pdfClient.renderPage({ docKey: 'r2-pdf', pdfBytes, pageIndex: 0, scale: 0.5 }),
      host.pdfClient.renderPage({ docKey: 'r2-pdf', pdfBytes, pageIndex: 0, scale: 1 }),
      host.pdfClient.renderPage({ docKey: 'r2-pdf', pdfBytes, pageIndex: 0, scale: 1 }),
      host.pdfClient.renderPage({ docKey: 'r2-pdf', pdfBytes, pageIndex: 0, scale: 2 }),
    ]);

    // Transfer p1a buffer and confirm next cache hit still returns full RGBA bytes.
    structuredClone(p1a.rgba.buffer, { transfer: [p1a.rgba.buffer] });
    const p1AfterTransfer = await host.pdfClient.renderPage({
      docKey: 'r2-pdf',
      pdfBytes,
      pageIndex: 0,
      scale: 1,
    });

    // Composite the 2x hayro PDF bitmap onto production index.html #app-canvas.
    const off = document.createElement('canvas');
    off.width = p2x.widthPx;
    off.height = p2x.heightPx;
    off.getContext('2d').putImageData(
      new ImageData(new Uint8ClampedArray(p2x.rgba), p2x.widthPx, p2x.heightPx),
      0,
      0
    );

    host.selectionOverlay.setScene({
      theme: 'light',
      selection: null,
      paint(ctx, vw, vh) {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, vw, vh);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, vw, 92);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 91, vw, 1);
        ctx.fillStyle = '#0f172a';
        ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('9:41', 22, 30);
        ctx.font = '700 17px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('Quarterly Report.pdf', 22, 72);
        ctx.fillStyle = '#1e6efb';
        ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('hayro Wasm', 298, 72);

        const cardX = 16;
        const cardY = 112;
        const cardW = vw - 32;
        const cardH = 540;
        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 14);
        ctx.fill();
        ctx.restore();

        const pad = 12;
        const drawW = cardW - pad * 2;
        const drawH = Math.min(cardH - 64, (drawW * p2x.heightPx) / p2x.widthPx);
        ctx.drawImage(off, cardX + pad, cardY + pad, drawW, drawH);

        const footerY = cardY + cardH - 42;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(cardX + 12, footerY - 10, cardW - 24, 1);
        ctx.fillStyle = '#0f172a';
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText('Page 1 / ' + pageCount, cardX + 20, footerY + 14);
        ctx.fillStyle = '#475569';
        ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText(p2x.widthPx + 'x' + p2x.heightPx + ' RGBA • Cached', cardX + 190, footerY + 14);

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(24, 680, vw - 48, 44, 10);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Lazy hayro pdf-worker.wasm · 0 PDFium · 0 DOM overlays', vw / 2, 706);
        ctx.textAlign = 'left';
      },
    });

    const stats = host.pdfClient.getStats();
    return {
      spawnedBefore,
      pageCount,
      half: { w: pHalf.widthPx, h: pHalf.heightPx },
      one: { w: p1b.widthPx, h: p1b.heightPx },
      two: { w: p2x.widthPx, h: p2x.heightPx },
      afterTransferBytes: p1AfterTransfer.rgba.byteLength,
      afterTransferFromCache: p1AfterTransfer.fromCache,
      stats,
    };
  })()`);

  assert.equal(pdfResult.spawnedBefore, false);
  assert.equal(wasmRequestCount, 1);
  assert.equal(pdfResult.pageCount, 2);
  assert.equal(pdfResult.one.w, pdfResult.half.w * 2);
  assert.equal(pdfResult.two.w, pdfResult.one.w * 2);
  assert.equal(pdfResult.one.h, pdfResult.half.h * 2);
  assert.equal(pdfResult.two.h, pdfResult.one.h * 2);
  assert.equal(pdfResult.afterTransferFromCache, true);
  assert.equal(
    pdfResult.afterTransferBytes,
    pdfResult.one.w * pdfResult.one.h * 4
  );

  if (outDir) {
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(
      join(outDir, 'web-pdf-worker-preview.png'),
      Buffer.from(shot2.data, 'base64')
    );
  }

  console.log(
    `Real-browser S3-Web E2E passed on production index.html (${chromeBin}):`,
    JSON.stringify({
      webglRecovered: webglRecovery.afterRestore.status === 'ready',
      postBootRetryPassed:
        blockedRetry.hasBootWhileBlocked &&
        blockedRetry.hasRetryBtn &&
        blockedRetry.persistedUpdates === 1,
      touchPointerUpClipboardPassed: true,
      pdfScales: {
        half: `${pdfResult.half.w}x${pdfResult.half.h}`,
        one: `${pdfResult.one.w}x${pdfResult.one.h}`,
        two: `${pdfResult.two.w}x${pdfResult.two.h}`,
      },
      pdfWasmRequests: wasmRequestCount,
      screenshotsDir: outDir,
    })
  );
} finally {
  try {
    ws?.close();
  } catch {}
  try {
    if (chromeProc.pid) {
      process.kill(chromeProc.pid, 'SIGTERM');
    }
  } catch {}
  await new Promise(r => setTimeout(r, 200));
  try {
    if (chromeProc.pid) {
      process.kill(chromeProc.pid, 'SIGKILL');
    }
  } catch {}
  server.close();
  rmSync(profileDir, { recursive: true, force: true });
}
