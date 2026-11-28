#!/usr/bin/env node
// @ts-check

/**
 * End-to-end verification for hosted `canary` dual-shell static routing +
 * pure-Rust `server-http` (`affine-server`) + real Headless Chromium:
 *
 *   1. Stages `<static_root>/{mobile,mobile-legacy}` via `stage-canary-dual-shell.mjs`
 *      and verifies zero third-party JS in the staged mobile shell.
 *   2. Starts a real `affine-server` (`--role front --deployment-mode cloud --channel canary`)
 *      or connects to `--base-url <url>`.
 *   3. Opens two same-origin tabs in real Headless Chromium (`390x844 @ 2x DPR`):
 *      - Tab A: `native` mobile shell
 *      - Tab B: `mobile-legacy` fallback shell (`?shell=legacy`, sets `affine_shell=legacy`)
 *      Verifies Tab A lazily loads `/mobile/*`, `/wasm/*`, `/pkg/*` after Tab B sets
 *      the `legacy` cookie with 0 404s, 0 CSP violations, and 0 cross-shell asset leaks.
 *   4. Verifies `/sign-in`, `/magic-link`, `/oauth/callback` auth route & strict CSP boundary.
 *   5. Verifies SSR OpenGraph (`og:title`, `og:description`, `og:image`) & `X-Robots-Tag: noindex`
 *      on `/workspace/<ws>/<doc>` for both crawler UA and mobile UA.
 *   6. Injects 2 consecutive WebGPU crashes (`device.lost` + `uncapturederror`) in real Chromium:
 *      - Crash #1 recovers in-place on `native` shell without navigation.
 *      - Verifies flush-failure aborts redirect (`fallback-blocked`) without silent data loss.
 *      - Crash #2 trips `webgpu-crash-threshold`, flushes pending Yjs edits via
 *        `flushPendingBeforeRedirect` into same-origin IndexedDB, writes fallback marker,
 *        navigates to `?shell=legacy`, and confirms `mobile-legacy` reads back the exact edit.
 *
 * Never runs `playwright install`. Kills all spawned child processes by exact PID in `finally`.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { stageCanaryDualShell } from './stage-canary-dual-shell.mjs';
import { verifyZeroThirdPartyJs } from './verify-zero-third-party-js.mjs';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO_ROOT = resolve(WEB_ROOT, '../../..');
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const CRAWLER_UA = 'Twitterbot/1.0';

function parseCliArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (
      token === '--out-dir' ||
      token === '--wasm-dir' ||
      token === '--legacy-dir' ||
      token === '--yjs-bundle' ||
      token === '--server-bin' ||
      token === '--database-url' ||
      token === '--base-url' ||
      token === '--public-doc-path' ||
      token === '--private-doc-path' ||
      token === '--expected-og-title'
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

function chromeEnv() {
  const env = { ...process.env };
  if (!/^(unix|tcp):/.test(env.DBUS_SESSION_BUS_ADDRESS || '')) {
    env.DBUS_SESSION_BUS_ADDRESS = 'unix:path=/nonexistent/affine-no-dbus';
  }
  return env;
}

async function allocateFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', rejectPort);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(err => {
        if (err) rejectPort(err);
        else resolvePort(port);
      });
    });
  });
}

async function waitForHealthz(baseUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) {
        return;
      }
    } catch {
      // Server still booting.
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/healthz`);
}

function resolveServerBin(explicitBin) {
  const candidates = [
    explicitBin,
    process.env.AFFINE_SERVER_BIN,
    join(REPO_ROOT, 'packages/backend/target/debug/affine-server'),
    join(REPO_ROOT, 'packages/backend/target/release/affine-server'),
  ].filter(Boolean);
  for (const bin of candidates) {
    if (bin && existsSync(bin)) {
      return resolve(bin);
    }
  }
  throw new Error(
    'Missing affine-server binary. Build it in packages/backend or pass --server-bin <path>.'
  );
}

/**
 * Connects to one CDP page target and returns helpers + network/CSP monitors.
 *
 * @param {string} wsUrl
 */
async function connectCdpTarget(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', fail, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  /** @type {Array<{ url: string, status: number, type: string }>} */
  const responses = [];
  /** @type {Array<{ url: string, errorText: string }>} */
  const failedRequests = [];
  /** @type {Array<string>} */
  const consoleErrors = [];
  /** @type {Map<string, string>} */
  const requestUrls = new Map();

  ws.addEventListener('message', ev => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message));
      else ok(msg.result);
      return;
    }
    if (msg.method === 'Network.requestWillBeSent') {
      requestUrls.set(msg.params.requestId, msg.params.request.url);
    } else if (msg.method === 'Network.responseReceived') {
      responses.push({
        url: msg.params.response.url,
        status: msg.params.response.status,
        type: msg.params.type || 'Other',
      });
    } else if (msg.method === 'Network.loadingFailed') {
      const url = requestUrls.get(msg.params.requestId) || 'unknown';
      if (!msg.params.canceled) {
        failedRequests.push({
          url,
          errorText: msg.params.errorText || 'loadingFailed',
        });
      }
    } else if (
      msg.method === 'Runtime.consoleAPICalled' &&
      msg.params.type === 'error'
    ) {
      const text = (msg.params.args || [])
        .map(a => a.value ?? a.description ?? '')
        .join(' ');
      consoleErrors.push(text);
    } else if (
      msg.method === 'Log.entryAdded' &&
      msg.params.entry?.level === 'error'
    ) {
      consoleErrors.push(msg.params.entry.text || 'log-error');
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
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.setUserAgentOverride', { userAgent: MOBILE_UA });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__S5_CSP_VIOLATIONS__ = [];
      window.addEventListener('securitypolicyviolation', ev => {
        window.__S5_CSP_VIOLATIONS__.push({
          blockedURI: ev.blockedURI,
          violatedDirective: ev.violatedDirective,
          effectiveDirective: ev.effectiveDirective,
        });
      });
    `,
  });

  return {
    ws,
    send,
    evalJs,
    responses,
    failedRequests,
    consoleErrors,
    close() {
      try {
        ws.close();
      } catch {
        // Ignore close errors.
      }
    },
  };
}

async function waitForCondition(evalJs, expr, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const val = await evalJs(expr);
      if (val) {
        return val;
      }
    } catch {
      // Page may be mid-navigation.
    }
    await new Promise(r => setTimeout(r, 80));
  }
  throw new Error(`Timed out waiting for condition: ${expr}`);
}

const cli = parseCliArgs(process.argv.slice(2));
const outDir =
  typeof cli['out-dir'] === 'string' ? resolve(cli['out-dir']) : null;
if (outDir) {
  mkdirSync(outDir, { recursive: true });
}

const workTmp = mkdtempSync(join(tmpdir(), 'affine-s5-canary-e2e-'));
const staticRoot = join(workTmp, 'static-root');
const chromeProfileDir = join(workTmp, 'chrome-profile');
mkdirSync(chromeProfileDir, { recursive: true });

let serverProc = null;
let chromeProc = null;
/** @type {Array<{ close: () => void }>} */
const openTabs = [];

try {
  // 1. Stage hosted canary dual-shell bundle (strictly requires real compiled Wasm + real yjs).
  const staged = stageCanaryDualShell({
    outDir: staticRoot,
    wasmDir: typeof cli['wasm-dir'] === 'string' ? cli['wasm-dir'] : null,
    legacyDir: typeof cli['legacy-dir'] === 'string' ? cli['legacy-dir'] : null,
    yjsBundle: typeof cli['yjs-bundle'] === 'string' ? cli['yjs-bundle'] : null,
  });
  const stagedYjsPath = join(staged.mobileLegacyDir, 'yjs.mjs');
  const yjsImportPath = existsSync(stagedYjsPath)
    ? stagedYjsPath
    : join(REPO_ROOT, 'node_modules/yjs/dist/yjs.mjs');
  const Y = await import(pathToFileURL(yjsImportPath).href);
  const zeroThirdParty = verifyZeroThirdPartyJs({ stageDir: staged.mobileDir });
  assert.equal(
    zeroThirdParty.ok,
    true,
    `Staged mobile shell failed zero-third-party-JS gate: ${zeroThirdParty.violations.join('; ')}`
  );

  // 2. Start real affine-server (--role front --deployment-mode cloud --channel canary) unless --base-url is given.
  let baseUrl = typeof cli['base-url'] === 'string' ? cli['base-url'] : '';
  if (!baseUrl) {
    const serverBin = resolveServerBin(
      typeof cli['server-bin'] === 'string' ? cli['server-bin'] : null
    );
    const databaseUrl =
      (typeof cli['database-url'] === 'string' && cli['database-url']) ||
      process.env.DATABASE_URL ||
      process.env.AFFINE_TEST_PG_URL;
    if (!databaseUrl) {
      throw new Error(
        'Missing --database-url (or DATABASE_URL / AFFINE_TEST_PG_URL) for affine-server'
      );
    }
    const port = await allocateFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    let serverLogs = '';
    serverProc = spawn(
      serverBin,
      [
        '--role',
        'front',
        '--deployment-mode',
        'cloud',
        '--channel',
        'canary',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--external-url',
        baseUrl,
        '--static-dir',
        staticRoot,
        '--database-url',
        databaseUrl,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], env: process.env }
    );
    serverProc.stdout?.on('data', chunk => {
      serverLogs += String(chunk);
    });
    serverProc.stderr?.on('data', chunk => {
      serverLogs += String(chunk);
    });
    try {
      await waitForHealthz(baseUrl, 20000);
    } catch (err) {
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\nServer logs:\n${serverLogs}`
      );
    }
  }

  // 3. Launch real Headless Chromium (existing binary, never playwright install).
  const chromeBin = findChromiumBinary();
  chromeProc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-sync',
      '--disable-extensions',
      '--disable-component-update',
      '--metrics-recording-only',
      '--remote-debugging-port=0',
      `--user-data-dir=${chromeProfileDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], env: chromeEnv() }
  );

  const browserWsUrl = await new Promise((resolveWs, rejectWs) => {
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

  const debugPort = new URL(browserWsUrl).port;
  const openNewTab = async () => {
    const res = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?about:blank`,
      { method: 'PUT' }
    );
    const target = await res.json();
    const tab = await connectCdpTarget(target.webSocketDebuggerUrl);
    openTabs.push(tab);
    return tab;
  };

  // --- Scenario A: Same-origin Dual-Tab (Tab A = native, Tab B = mobile-legacy) ---
  const tabA = await openNewTab();
  await tabA.send('Page.navigate', { url: `${baseUrl}/` });
  await waitForCondition(
    tabA.evalJs,
    'Boolean(window.__AFFINE_WEB_HOST__ && window.__AFFINE_WEB_HOST__.selectionOverlay && !document.getElementById("boot"))'
  );
  const tabAInfo = await tabA.evalJs(`(() => {
    const h = window.__AFFINE_WEB_HOST__;
    return {
      shellBuildId: h.workerLoader.manifest.shell_build_id,
      assetBaseUrl: h.workerLoader.assetBaseUrl,
      cspViolationCount: (window.__S5_CSP_VIOLATIONS__ || []).length,
    };
  })()`);
  assert.equal(tabAInfo.shellBuildId, staged.shellBuildId);
  assert.equal(tabAInfo.assetBaseUrl, '/mobile/');
  assert.equal(tabAInfo.cspViolationCount, 0);

  // Paint a clear status card onto Tab A canvas for visual evidence.
  await tabA.evalJs(`(() => {
    const h = window.__AFFINE_WEB_HOST__;
    h.selectionOverlay.setScene({
      theme: 'light',
      selection: null,
      paint(ctx, vw, vh) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, vw, vh);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, vw, 88);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 18px -apple-system, sans-serif';
        ctx.fillText('AFFiNE Canary Native Shell', 20, 56);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(18, 112, vw - 36, 180, 14);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = '600 15px -apple-system, sans-serif';
        ctx.fillText('Tab A: Native Mobile Host', 34, 148);
        ctx.fillStyle = '#475569';
        ctx.font = '400 13px -apple-system, sans-serif';
        ctx.fillText('shell_build_id: ' + h.workerLoader.manifest.shell_build_id, 34, 182);
        ctx.fillText('assetBaseUrl: ' + h.workerLoader.assetBaseUrl, 34, 208);
        ctx.fillText('Status: 0 404s, 0 CSP violations', 34, 234);
      },
    });
  })()`);
  if (outDir) {
    const shot = await tabA.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(
      join(outDir, 's5-tab-a-native.png'),
      Buffer.from(shot.data, 'base64')
    );
  }

  // Open Tab B on the SAME ORIGIN with ?shell=legacy (flips affine_shell=legacy cookie!).
  const tabB = await openNewTab();
  await tabB.send('Page.navigate', { url: `${baseUrl}/?shell=legacy` });
  await waitForCondition(
    tabB.evalJs,
    'Boolean(window.__AFFINE_LEGACY_SHELL__ && window.__AFFINE_LEGACY_SHELL__.ready)'
  );
  const tabBInfo = await tabB.evalJs(`({
    shell: window.__AFFINE_LEGACY_SHELL__.shell,
    buildId: window.__AFFINE_LEGACY_SHELL__.buildId,
    cookie: document.cookie,
    cspViolationCount: (window.__S5_CSP_VIOLATIONS__ || []).length,
  })`);
  assert.equal(tabBInfo.shell, 'legacy');
  assert.ok(
    tabBInfo.cookie.includes('affine_shell=legacy'),
    `Expected affine_shell=legacy cookie, got: ${tabBInfo.cookie}`
  );
  assert.equal(tabBInfo.cspViolationCount, 0);
  if (outDir) {
    const shot = await tabB.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(
      join(outDir, 's5-tab-b-legacy.png'),
      Buffer.from(shot.data, 'base64')
    );
  }

  // Now with affine_shell=legacy active in the shared cookie jar, Tab A lazily fetches
  // its pinned font, worker wasm, and main pkg wasm — MUST all return 200 with real compiled Wasm bytes (> 10 KB) and zero cross-shell leakage!
  const tabALazyFetch = await tabA.evalJs(`(async () => {
    const h = window.__AFFINE_WEB_HOST__;
    const cookieSeenByTabA = document.cookie;
    const fontBuf = await h.workerLoader.loadFont('latin');
    const pdfAssets = h.workerLoader.resolveWorkerAssets('pdf');
    const wasmResp = await fetch(pdfAssets.wasm, { credentials: 'same-origin' });
    const wasmBytes = (await wasmResp.arrayBuffer()).byteLength;
    const directWasmResp = await fetch('/wasm/pdf-worker.' + h.workerLoader.manifest.shell_build_id + '.wasm', { credentials: 'same-origin' });
    const directWasmBytes = (await directWasmResp.arrayBuffer()).byteLength;
    const pkgResp = await fetch('/pkg/playground_bg.wasm', { credentials: 'same-origin' });
    const pkgBytes = (await pkgResp.arrayBuffer()).byteLength;
    return {
      cookieSeenByTabA,
      fontBytes: fontBuf.byteLength,
      wasmUrl: pdfAssets.wasm,
      wasmStatus: wasmResp.status,
      wasmBytes,
      wasmContentType: wasmResp.headers.get('content-type'),
      directWasmStatus: directWasmResp.status,
      directWasmBytes,
      pkgStatus: pkgResp.status,
      pkgBytes,
      cspViolationCount: (window.__S5_CSP_VIOLATIONS__ || []).length,
    };
  })()`);
  assert.ok(
    tabALazyFetch.cookieSeenByTabA.includes('affine_shell=legacy'),
    'Tab A must share the same-origin cookie jar with Tab B'
  );
  assert.ok(tabALazyFetch.fontBytes > 1000, 'Lazy font fetch must succeed');
  assert.equal(tabALazyFetch.wasmStatus, 200);
  assert.ok(
    tabALazyFetch.wasmBytes > 10 * 1024,
    `Expected real compiled pdf-worker wasm (> 10 KB), got ${tabALazyFetch.wasmBytes}`
  );
  assert.equal(tabALazyFetch.wasmContentType, 'application/wasm');
  assert.equal(tabALazyFetch.directWasmStatus, 200);
  assert.ok(tabALazyFetch.directWasmBytes > 10 * 1024);
  assert.equal(tabALazyFetch.pkgStatus, 200);
  assert.ok(
    tabALazyFetch.pkgBytes > 10 * 1024,
    `Expected real compiled playground_bg.wasm (> 10 KB), got ${tabALazyFetch.pkgBytes}`
  );
  assert.equal(tabALazyFetch.cspViolationCount, 0);

  const tabA404s = tabA.responses.filter(r => r.status >= 400);
  const tabB404s = tabB.responses.filter(r => r.status >= 400);
  assert.deepEqual(
    tabA404s,
    [],
    `Tab A had HTTP >=400 responses: ${JSON.stringify(tabA404s)}`
  );
  assert.deepEqual(
    tabB404s,
    [],
    `Tab B had HTTP >=400 responses: ${JSON.stringify(tabB404s)}`
  );
  assert.deepEqual(tabA.failedRequests, []);
  assert.deepEqual(tabB.failedRequests, []);

  // Verify zero cross-shell asset leakage: Tab A never loaded /mobile-legacy/*, Tab B never loaded /mobile/*.
  assert.equal(
    tabA.responses.some(r =>
      new URL(r.url).pathname.startsWith('/mobile-legacy/')
    ),
    false,
    'Tab A (native) must never receive /mobile-legacy/* assets'
  );
  assert.equal(
    tabB.responses.some(r => new URL(r.url).pathname.startsWith('/mobile/')),
    false,
    'Tab B (legacy) must never receive /mobile/* assets'
  );

  // --- Scenario B: Auth routes (/sign-in, /magic-link, /oauth/callback) & strict CSP ---
  for (const authPath of ['/sign-in', '/magic-link', '/oauth/callback']) {
    const authRes = await fetch(`${baseUrl}${authPath}`, {
      headers: {
        'user-agent': MOBILE_UA,
        cookie: 'affine_shell=native',
      },
    });
    assert.equal(authRes.status, 200, `${authPath} must return 200`);
    const html = await authRes.text();
    assert.ok(
      html.includes('id="auth-card"'),
      `${authPath} must serve mobile sign-in.html`
    );
    assert.ok(
      html.includes('/mobile/src/sign-in.js'),
      `${authPath} must load cookie-immune /mobile/src/sign-in.js`
    );
    assert.ok(
      html.includes('https://challenges.cloudflare.com'),
      `${authPath} CSP allows Turnstile isolation`
    );
  }
  const mainIndexRes = await fetch(`${baseUrl}/?shell=native`, {
    headers: { 'user-agent': MOBILE_UA },
  });
  const mainIndexHtml = await mainIndexRes.text();
  assert.equal(
    mainIndexHtml.includes('challenges.cloudflare.com'),
    false,
    'Main mobile shell CSP must never include Turnstile domain'
  );

  // --- Scenario C: Public share / crawler SSR OpenGraph verification ---
  const publicDocPath =
    typeof cli['public-doc-path'] === 'string'
      ? cli['public-doc-path']
      : '/workspace/ws-og/doc-public';
  const privateDocPath =
    typeof cli['private-doc-path'] === 'string'
      ? cli['private-doc-path']
      : '/workspace/ws-og/doc-private';
  const expectedOgTitle =
    typeof cli['expected-og-title'] === 'string'
      ? cli['expected-og-title']
      : '';

  const crawlerResp = await fetch(`${baseUrl}${publicDocPath}`, {
    headers: { 'user-agent': CRAWLER_UA, accept: 'text/html' },
  });
  assert.equal(crawlerResp.status, 200);
  const crawlerHtml = await crawlerResp.text();
  assert.ok(crawlerHtml.includes('property="og:title"'), 'Missing og:title');
  assert.ok(
    crawlerHtml.includes('property="og:description"'),
    'Missing og:description'
  );
  assert.ok(crawlerHtml.includes('property="og:image"'), 'Missing og:image');
  if (expectedOgTitle) {
    assert.ok(
      crawlerHtml.includes(expectedOgTitle),
      `Expected crawler OG HTML to contain "${expectedOgTitle}"`
    );
    assert.equal(
      crawlerResp.headers.get('x-robots-tag'),
      null,
      'Public doc must be indexable (no x-robots-tag: noindex)'
    );
  }

  const mobileDocResp = await fetch(`${baseUrl}${publicDocPath}`, {
    headers: { 'user-agent': MOBILE_UA, accept: 'text/html' },
  });
  assert.equal(mobileDocResp.status, 200);
  const mobileDocHtml = await mobileDocResp.text();
  assert.ok(
    mobileDocHtml.includes('property="og:title"'),
    'Mobile SSR doc response must retain og:title'
  );
  assert.ok(
    mobileDocHtml.includes('id="app-canvas"'),
    'Mobile SSR doc response must retain native shell #app-canvas'
  );
  assert.ok(
    mobileDocHtml.includes('/mobile/src/host.js'),
    'Mobile SSR doc response must retain cookie-immune /mobile/src/host.js'
  );
  if (expectedOgTitle) {
    assert.ok(
      mobileDocHtml.includes(expectedOgTitle),
      `Mobile SSR doc response must contain "${expectedOgTitle}"`
    );
  }

  const privResp = await fetch(`${baseUrl}${privateDocPath}`, {
    headers: { 'user-agent': CRAWLER_UA, accept: 'text/html' },
  });
  assert.equal(privResp.status, 200);
  assert.equal(privResp.headers.get('x-robots-tag'), 'noindex');
  const privHtml = await privResp.text();
  assert.ok(privHtml.includes('noindex, nofollow'));

  // --- Scenario D: Double WebGPU Crash Circuit Breaker + IDB Flush Barrier + Legacy Takeover ---
  const gpuTab = await openNewTab();
  await gpuTab.send('Page.navigate', {
    url: `${baseUrl}/?shell=native&workspace=s5-gpu-ws`,
  });
  await waitForCondition(
    gpuTab.evalJs,
    'Boolean(window.__AFFINE_WEB_HOST__ && window.__AFFINE_WEB_HOST__.selectionOverlay && !document.getElementById("boot"))'
  );

  // Set up workspace IDB + enqueue a REAL Yjs V1 CRDT update created by real `yjs`:
  //   Page -> [Note 1 (Para A -> Nested Child Para B), Hidden Edgeless Note (excluded), Note 2 (Para C)]
  // + verify flush-failure abort + inject crash #1 in-place recovery.
  const note1ParaA = 'S5-NOTE1-PARA-A';
  const nestedChildB = 'S5-NESTED-CHILD-B';
  const hiddenEdgelessText = 'EDGELESS-ONLY-HIDDEN';
  const note2ParaC = 'S5-NOTE2-PARA-C';
  const legacyEdit2Text = 'S5-CRDT-EDIT-2-LEGACY-UI';
  const legacyEdit3Text = 'S5-CRDT-EDIT-3-AFTER-RELOAD-UI';
  const nativeDoc = new Y.Doc();
  nativeDoc.transact(() => {
    const blocks = nativeDoc.getMap('blocks');
    const makePara = (id, text, children = []) => {
      const para = new Y.Map();
      para.set('sys:id', id);
      para.set('sys:flavour', 'affine:paragraph');
      para.set('prop:type', 'text');
      const yText = new Y.Text();
      yText.insert(0, text);
      para.set('prop:text', yText);
      if (children.length > 0) {
        const ch = new Y.Array();
        ch.push(children);
        para.set('sys:children', ch);
      }
      blocks.set(id, para);
    };

    const page = new Y.Map();
    page.set('sys:id', 'page-s5');
    page.set('sys:flavour', 'affine:page');
    const pageChildren = new Y.Array();
    pageChildren.push(['note-1', 'note-hidden', 'note-2']);
    page.set('sys:children', pageChildren);
    blocks.set('page-s5', page);

    const note1 = new Y.Map();
    note1.set('sys:id', 'note-1');
    note1.set('sys:flavour', 'affine:note');
    const note1Children = new Y.Array();
    note1Children.push(['para-a']);
    note1.set('sys:children', note1Children);
    blocks.set('note-1', note1);
    makePara('para-a', note1ParaA, ['para-b']);
    makePara('para-b', nestedChildB);

    const hiddenNote = new Y.Map();
    hiddenNote.set('sys:id', 'note-hidden');
    hiddenNote.set('sys:flavour', 'affine:note');
    hiddenNote.set('prop:hidden', true);
    const hiddenChildren = new Y.Array();
    hiddenChildren.push(['para-hidden']);
    hiddenNote.set('sys:children', hiddenChildren);
    blocks.set('note-hidden', hiddenNote);
    makePara('para-hidden', hiddenEdgelessText);

    const note2 = new Y.Map();
    note2.set('sys:id', 'note-2');
    note2.set('sys:flavour', 'affine:note');
    const note2Children = new Y.Array();
    note2Children.push(['para-c']);
    note2.set('sys:children', note2Children);
    blocks.set('note-2', note2);
    makePara('para-c', note2ParaC);
  });
  const realYjsV1Edit1 = Array.from(Y.encodeStateAsUpdate(nativeDoc));
  const crash1Result = await gpuTab.evalJs(`(async () => {
    const h = window.__AFFINE_WEB_HOST__;
    h.attachWorkspace({ flavour: 'local', type: 'workspace', id: 's5-gpu-ws' });
    const yjsV1Update = new Uint8Array(${JSON.stringify(realYjsV1Edit1)});
    h.pendingWrites.enqueue({
      docId: 'doc-s5-crash',
      bin: yjsV1Update,
    });

    // Verify flushPendingBeforeRedirect aborts on flush failure without losing pending writes.
    const { flushPendingBeforeRedirect } = await import('/mobile/src/host.js');
    let abortedNavCalled = false;
    const abortCheck = await flushPendingBeforeRedirect({
      pauseInput: () => {},
      flushPendingWrites: async () => {
        throw new Error('simulated-idb-lock');
      },
      navigate: () => {
        abortedNavCalled = true;
      },
      resumeInput: () => {},
      targetUrl: '/?shell=legacy',
    });

    // Wire controllable WebGPU devices (device1 -> crash #1 rebuilds device2 -> crash #2 trips circuit breaker).
    const makeFakeDevice = name => {
      let resolveLost;
      const lost = new Promise(r => { resolveLost = r; });
      const listeners = new Map();
      return {
        name,
        lost,
        addEventListener(type, fn) {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(fn);
        },
        triggerLost(reason) {
          resolveLost({ reason });
        },
        triggerUncapturedError(message) {
          for (const fn of listeners.get('uncapturederror') || []) {
            fn({ error: { message } });
          }
        },
      };
    };

    const dev1 = makeFakeDevice('gpu-dev-1');
    const dev2 = makeFakeDevice('gpu-dev-2');
    window.__S5_GPU_DEV2__ = dev2;
    let rebuildCount = 0;

    const deviceOpts = {
      tryRebuildWebGpu: async () => {
        rebuildCount += 1;
        h.bindWebGpuDevice(dev2, deviceOpts);
        h.selectionOverlay.setScene({
          theme: 'light',
          selection: null,
          paint(ctx, vw, vh) {
            ctx.fillStyle = '#ecfdf5';
            ctx.fillRect(0, 0, vw, vh);
            ctx.fillStyle = '#065f46';
            ctx.fillRect(0, 0, vw, 88);
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 18px -apple-system, sans-serif';
            ctx.fillText('WebGPU Crash #1 Recovered', 20, 56);
            ctx.fillStyle = '#064e3b';
            ctx.font = '600 15px -apple-system, sans-serif';
            ctx.fillText('In-place GPU rebuild succeeded', 24, 140);
            ctx.font = '400 13px -apple-system, sans-serif';
            ctx.fillText('shell_build_id: ' + h.workerLoader.manifest.shell_build_id, 24, 170);
            ctx.fillText('Pending Yjs V1 CRDT edit buffered: ' + h.pendingWrites.pendingCount(), 24, 198);
            ctx.fillText('Next crash trips flush + legacy takeover', 24, 226);
          },
        });
        return true;
      },
    };
    h.bindWebGpuDevice(dev1, deviceOpts);

    // Inject WebGPU crash #1 (device.lost).
    dev1.triggerLost('destroyed');
    await new Promise(r => setTimeout(r, 80));

    return {
      abortCheck,
      abortedNavCalled,
      rebuildCount,
      pendingAfterCrash1: h.pendingWrites.pendingCount(),
      stateAfterCrash1: h.gpuRecovery.getState(),
      hrefAfterCrash1: window.location.href,
    };
  })()`);

  assert.equal(crash1Result.abortCheck.navigated, false);
  assert.equal(crash1Result.abortedNavCalled, false);
  assert.equal(crash1Result.rebuildCount, 1);
  assert.equal(crash1Result.pendingAfterCrash1, 1);
  assert.equal(crash1Result.stateAfterCrash1.status, 'ready');
  assert.equal(crash1Result.stateAfterCrash1.webGpuLossCount, 1);
  assert.equal(crash1Result.stateAfterCrash1.restoreCount, 1);
  assert.ok(
    crash1Result.hrefAfterCrash1.includes('shell=native'),
    'Crash #1 must recover in-place on native shell'
  );

  if (outDir) {
    const shot = await gpuTab.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(
      join(outDir, 's5-gpu-crash1-recovered.png'),
      Buffer.from(shot.data, 'base64')
    );
  }

  // Inject WebGPU crash #2 (uncapturederror on rebuilt device2) -> flushes IDB -> navigates to ?shell=legacy!
  await gpuTab.evalJs(`(() => {
    window.__S5_GPU_DEV2__.triggerUncapturedError('gpu-device-fatal-crash-2');
    return true;
  })()`);

  await waitForCondition(
    gpuTab.evalJs,
    'Boolean(window.__AFFINE_LEGACY_SHELL__ && window.__AFFINE_LEGACY_SHELL__.ready)',
    15000
  );
  const crash2Takeover = await gpuTab.evalJs(`({
    href: window.location.href,
    cookie: document.cookie,
    legacyState: window.__AFFINE_LEGACY_SHELL__,
    cspViolationCount: (window.__S5_CSP_VIOLATIONS__ || []).length,
  })`);

  assert.ok(
    crash2Takeover.href.includes('shell=legacy'),
    `Expected redirect to ?shell=legacy, got ${crash2Takeover.href}`
  );
  assert.ok(
    crash2Takeover.cookie.includes('affine_shell=legacy'),
    'Expected affine_shell=legacy cookie after takeover'
  );
  assert.equal(
    crash2Takeover.legacyState.fallbackReason,
    'webgpu-crash-threshold'
  );
  assert.equal(crash2Takeover.cspViolationCount, 0);
  const initialRecoveredDoc = crash2Takeover.legacyState.recoveredDocs.find(
    d => d.docId === 'doc-s5-crash'
  );
  assert.ok(
    initialRecoveredDoc &&
      initialRecoveredDoc.flavours.includes('affine:page') &&
      initialRecoveredDoc.flavours.includes('affine:note') &&
      initialRecoveredDoc.flavours.includes('affine:paragraph'),
    `Expected mobile-legacy to decode real Yjs V1 BlockSuite blocks from IndexedDB, got: ${JSON.stringify(crash2Takeover.legacyState.recoveredDocs)}`
  );
  assert.deepEqual(
    initialRecoveredDoc.paragraphs,
    [note1ParaA, nestedChildB, note2ParaC],
    'Legacy shell must walk all visible Notes and nested sys:children while excluding hidden edgeless Notes'
  );
  const initialDomText = await gpuTab.evalJs(
    `document.getElementById('legacy-recovered-doc')?.textContent || ''`
  );
  assert.ok(initialDomText.includes(note1ParaA));
  assert.ok(initialDomText.includes(nestedChildB));
  assert.ok(initialDomText.includes(note2ParaC));
  assert.equal(initialDomText.includes(hiddenEdgelessText), false);

  /**
   * Drives the real visible legacy UI controls (`#legacy-editor-input` +
   * `#legacy-append-btn`) via real Chromium CDP keyboard input and mouse click.
   *
   * @param {string} text
   */
  const appendViaRealLegacyUi = async text => {
    const inputCenter = await gpuTab.evalJs(`(() => {
      const input = document.getElementById('legacy-editor-input');
      if (!input) throw new Error('Missing #legacy-editor-input');
      input.scrollIntoView({ block: 'center' });
      input.focus();
      input.value = '';
      const r = input.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await gpuTab.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: inputCenter.x,
      y: inputCenter.y,
      button: 'left',
      clickCount: 1,
    });
    await gpuTab.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: inputCenter.x,
      y: inputCenter.y,
      button: 'left',
      clickCount: 1,
    });
    await gpuTab.send('Input.insertText', { text });

    const btnCenter = await gpuTab.evalJs(`(() => {
      const btn = document.getElementById('legacy-append-btn');
      if (!btn) throw new Error('Missing #legacy-append-btn');
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await gpuTab.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: btnCenter.x,
      y: btnCenter.y,
      button: 'left',
      clickCount: 1,
    });
    await gpuTab.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: btnCenter.x,
      y: btnCenter.y,
      button: 'left',
      clickCount: 1,
    });

    await waitForCondition(
      gpuTab.evalJs,
      `(document.getElementById('legacy-recovered-doc')?.textContent || '').includes(${JSON.stringify(text)})`,
      15000
    );
    return gpuTab.evalJs(`({
      clientID: window.__AFFINE_LEGACY_SHELL__?.lastEditClientID ?? null,
      domText: document.getElementById('legacy-recovered-doc')?.textContent || '',
      editorStatus: document.getElementById('legacy-editor-status')?.textContent || '',
    })`);
  };

  // Edit #2 via real UI input + click -> reload page -> Edit #3 via real UI input + click -> reload again!
  const legacyEdit2Ui = await appendViaRealLegacyUi(legacyEdit2Text);
  assert.ok(legacyEdit2Ui.clientID !== null);
  assert.ok(legacyEdit2Ui.domText.includes(legacyEdit2Text));

  await gpuTab.send('Page.reload', { ignoreCache: false });
  await waitForCondition(
    gpuTab.evalJs,
    'Boolean(window.__AFFINE_LEGACY_SHELL__ && window.__AFFINE_LEGACY_SHELL__.ready)',
    15000
  );
  const afterReload1 = await gpuTab.evalJs(`({
    legacyState: window.__AFFINE_LEGACY_SHELL__,
    domText: document.getElementById('legacy-recovered-doc')?.textContent || '',
    cspViolationCount: (window.__S5_CSP_VIOLATIONS__ || []).length,
  })`);
  assert.equal(afterReload1.cspViolationCount, 0);
  const docAfterReload1 = afterReload1.legacyState.recoveredDocs.find(
    d => d.docId === 'doc-s5-crash'
  );
  assert.deepEqual(docAfterReload1?.paragraphs, [
    note1ParaA,
    nestedChildB,
    note2ParaC,
    legacyEdit2Text,
  ]);
  assert.ok(afterReload1.domText.includes(legacyEdit2Text));

  // Edit #3 after reload via real UI input + click (must allocate a fresh random Y.Doc clientID!).
  const legacyEdit3Ui = await appendViaRealLegacyUi(legacyEdit3Text);
  assert.ok(legacyEdit3Ui.clientID !== null);
  assert.notEqual(
    legacyEdit3Ui.clientID,
    legacyEdit2Ui.clientID,
    'Reloaded legacy Y.Doc must allocate a fresh random clientID (no clock=0 collision)'
  );
  assert.ok(legacyEdit3Ui.domText.includes(legacyEdit3Text));

  await gpuTab.send('Page.reload', { ignoreCache: false });
  await waitForCondition(
    gpuTab.evalJs,
    'Boolean(window.__AFFINE_LEGACY_SHELL__ && window.__AFFINE_LEGACY_SHELL__.ready)',
    15000
  );
  const afterReloadTakeover = await gpuTab.evalJs(`({
    legacyState: window.__AFFINE_LEGACY_SHELL__,
    domText: document.getElementById('legacy-recovered-doc')?.textContent || '',
    cspViolationCount: (window.__S5_CSP_VIOLATIONS__ || []).length,
  })`);
  assert.equal(afterReloadTakeover.cspViolationCount, 0);
  const persistedDoc = afterReloadTakeover.legacyState.recoveredDocs.find(
    d => d.docId === 'doc-s5-crash'
  );
  assert.ok(
    persistedDoc && persistedDoc.updateCount >= 3,
    `Expected >= 3 Yjs updates persisted across reloads, got: ${JSON.stringify(afterReloadTakeover.legacyState.recoveredDocs)}`
  );
  const expectedAllParagraphs = [
    note1ParaA,
    nestedChildB,
    note2ParaC,
    legacyEdit2Text,
    legacyEdit3Text,
  ];
  assert.deepEqual(persistedDoc.paragraphs, expectedAllParagraphs);
  for (const line of expectedAllParagraphs) {
    assert.ok(
      afterReloadTakeover.domText.includes(line),
      `Visible #legacy-recovered-doc must include "${line}" after reload`
    );
  }
  assert.equal(afterReloadTakeover.domText.includes(hiddenEdgelessText), false);

  // Verify the REAL compiled playground Wasm (`merge_updates_v1`) in Tab A merges ALL 3 Yjs V1 updates cleanly,
  // then load the Wasm-merged binary into an independent Node `Y.Doc` and recursively walk
  // `Page -> visible Notes -> sys:children -> nested Paragraphs` to confirm all 5 paragraphs survive in order!
  const wasmMergeCheck = await tabA.evalJs(`(async () => {
    const h = window.__AFFINE_WEB_HOST__;
    h.attachWorkspace({ flavour: 'local', type: 'workspace', id: 's5-gpu-ws' });
    const raw = await h.workspaceStorage.getDocRaw('doc-s5-crash');
    const merged = await h.workspaceStorage.getDoc('doc-s5-crash');
    return {
      rawUpdatesCount: raw ? raw.updates.length : 0,
      mergedBytes: merged && merged.bin ? Array.from(merged.bin) : [],
    };
  })()`);
  assert.equal(wasmMergeCheck.rawUpdatesCount, 3);
  assert.ok(
    wasmMergeCheck.mergedBytes.length > 80,
    `Expected real playground Wasm merge_updates_v1 to produce a valid merged Yjs V1 snapshot`
  );
  const verifyDoc = new Y.Doc();
  Y.applyUpdate(verifyDoc, new Uint8Array(wasmMergeCheck.mergedBytes));
  const vBlocks = verifyDoc.getMap('blocks');
  const vPage = vBlocks.get('page-s5');
  assert.equal(vPage?.get('sys:flavour'), 'affine:page');
  const vPageChildren = vPage?.get('sys:children')?.toArray() || [];
  assert.deepEqual(vPageChildren, ['note-1', 'note-hidden', 'note-2']);
  /** @type {string[]} */
  const vParagraphs = [];
  const walkVerify = parentId => {
    const parent = vBlocks.get(parentId);
    const children = parent?.get('sys:children')?.toArray() || [];
    for (const cid of children) {
      const child = vBlocks.get(cid);
      const text = child?.get('prop:text');
      if (text) {
        vParagraphs.push(text.toString());
      }
      walkVerify(cid);
    }
  };
  const visibleNoteIds = [];
  for (const nid of vPageChildren) {
    const note = vBlocks.get(nid);
    if (
      note?.get('sys:flavour') === 'affine:note' &&
      note?.get('prop:hidden') !== true
    ) {
      visibleNoteIds.push(nid);
      walkVerify(nid);
    }
  }
  assert.deepEqual(visibleNoteIds, ['note-1', 'note-2']);
  assert.deepEqual(vParagraphs, expectedAllParagraphs);
  const mergedByteLength = wasmMergeCheck.mergedBytes.length;

  const gpuTab404s = gpuTab.responses.filter(r => r.status >= 400);
  assert.deepEqual(
    gpuTab404s,
    [],
    `GPU crash tab had HTTP >=400 responses: ${JSON.stringify(gpuTab404s)}`
  );

  if (outDir) {
    const shot = await gpuTab.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(
      join(outDir, 's5-gpu-crash2-legacy-takeover.png'),
      Buffer.from(shot.data, 'base64')
    );
  }

  // --- Scenario E (Astra R6): Multi-doc route targeting (/workspace/local/z-active) + <select> guard ---
  const makeSingleParaUpdate = (pageId, noteId, paraId, text) => {
    const d = new Y.Doc();
    d.transact(() => {
      const b = d.getMap('blocks');
      const p = new Y.Map();
      p.set('sys:id', pageId);
      p.set('sys:flavour', 'affine:page');
      const pc = new Y.Array();
      pc.push([noteId]);
      p.set('sys:children', pc);
      b.set(pageId, p);
      const n = new Y.Map();
      n.set('sys:id', noteId);
      n.set('sys:flavour', 'affine:note');
      const nc = new Y.Array();
      nc.push([paraId]);
      n.set('sys:children', nc);
      b.set(noteId, n);
      const para = new Y.Map();
      para.set('sys:id', paraId);
      para.set('sys:flavour', 'affine:paragraph');
      para.set('prop:type', 'text');
      const yt = new Y.Text();
      yt.insert(0, text);
      para.set('prop:text', yt);
      b.set(paraId, para);
    });
    return Array.from(Y.encodeStateAsUpdate(d));
  };
  const aOtherBin = makeSingleParaUpdate(
    'page-a',
    'note-a',
    'para-a-other',
    'A-OTHER-ORIGINAL'
  );
  const zActiveBin = makeSingleParaUpdate(
    'page-z',
    'note-z',
    'para-z-active',
    'Z-ACTIVE-ORIGINAL'
  );
  await tabA.evalJs(`(async () => {
    const h = window.__AFFINE_WEB_HOST__;
    h.attachWorkspace({ flavour: 'local', type: 'workspace', id: 'local' });
    await h.workspaceStorage.pushDocUpdate({
      docId: 'a-other',
      bin: new Uint8Array(${JSON.stringify(aOtherBin)}),
    });
    await h.workspaceStorage.pushDocUpdate({
      docId: 'z-active',
      bin: new Uint8Array(${JSON.stringify(zActiveBin)}),
    });
    return true;
  })()`);

  // 1. Ambiguous URL (no docId) with 2 docs must keep <select> at placeholder and disable append button.
  const multiDocTab = await openNewTab();
  await multiDocTab.send('Page.navigate', {
    url: `${baseUrl}/?shell=legacy&workspace=local`,
  });
  await waitForCondition(
    multiDocTab.evalJs,
    'Boolean(window.__AFFINE_LEGACY_SHELL__ && window.__AFFINE_LEGACY_SHELL__.ready)',
    15000
  );
  const ambiguousState = await multiDocTab.evalJs(`({
    selectValue: document.getElementById('legacy-target-doc')?.value ?? null,
    btnDisabled: document.getElementById('legacy-append-btn')?.disabled ?? null,
    selectedTarget: window.__AFFINE_LEGACY_SHELL__?.selectedTarget ?? null,
  })`);
  assert.equal(ambiguousState.selectValue, '');
  assert.equal(ambiguousState.btnDisabled, true);
  assert.equal(ambiguousState.selectedTarget, null);

  // 2. Explicit route `/workspace/local/z-active?shell=legacy&workspace=local` must target `z-active`
  //    and leave `a-other` untouched across real UI input + button click + reload!
  await multiDocTab.send('Page.navigate', {
    url: `${baseUrl}/workspace/local/z-active?shell=legacy&workspace=local`,
  });
  await waitForCondition(
    multiDocTab.evalJs,
    'Boolean(window.__AFFINE_LEGACY_SHELL__ && window.__AFFINE_LEGACY_SHELL__.ready)',
    15000
  );
  const targetedState = await multiDocTab.evalJs(`({
    selectedTarget: window.__AFFINE_LEGACY_SHELL__?.selectedTarget ?? null,
    btnDisabled: document.getElementById('legacy-append-btn')?.disabled ?? null,
  })`);
  assert.deepEqual(targetedState.selectedTarget, {
    dbName: 'local:workspace:local',
    docId: 'z-active',
  });
  assert.equal(targetedState.btnDisabled, false);

  const mdInputCenter = await multiDocTab.evalJs(`(() => {
    const input = document.getElementById('legacy-editor-input');
    input.scrollIntoView({ block: 'center' });
    input.focus();
    input.value = '';
    const r = input.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await multiDocTab.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: mdInputCenter.x,
    y: mdInputCenter.y,
    button: 'left',
    clickCount: 1,
  });
  await multiDocTab.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: mdInputCenter.x,
    y: mdInputCenter.y,
    button: 'left',
    clickCount: 1,
  });
  await multiDocTab.send('Input.insertText', { text: 'MARK-FOR-ACTIVE' });

  const mdBtnCenter = await multiDocTab.evalJs(`(() => {
    const btn = document.getElementById('legacy-append-btn');
    btn.scrollIntoView({ block: 'center' });
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await multiDocTab.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: mdBtnCenter.x,
    y: mdBtnCenter.y,
    button: 'left',
    clickCount: 1,
  });
  await multiDocTab.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: mdBtnCenter.x,
    y: mdBtnCenter.y,
    button: 'left',
    clickCount: 1,
  });
  await waitForCondition(
    multiDocTab.evalJs,
    `(document.getElementById('legacy-recovered-doc')?.textContent || '').includes('MARK-FOR-ACTIVE')`,
    15000
  );

  await multiDocTab.send('Page.reload', { ignoreCache: false });
  await waitForCondition(
    multiDocTab.evalJs,
    'Boolean(window.__AFFINE_LEGACY_SHELL__ && window.__AFFINE_LEGACY_SHELL__.ready)',
    15000
  );
  const multiDocAfterReload = await multiDocTab.evalJs(
    'window.__AFFINE_LEGACY_SHELL__.recoveredDocs'
  );
  const docAOther = multiDocAfterReload.find(d => d.docId === 'a-other');
  const docZActive = multiDocAfterReload.find(d => d.docId === 'z-active');
  assert.deepEqual(docAOther?.paragraphs, ['A-OTHER-ORIGINAL']);
  assert.deepEqual(docZActive?.paragraphs, [
    'Z-ACTIVE-ORIGINAL',
    'MARK-FOR-ACTIVE',
  ]);

  const report = {
    ok: true,
    shell_build_id: staged.shellBuildId,
    baseUrl,
    realWasm: {
      playgroundWasmBytes: staged.releaseManifest.pkg.wasmSha256
        ? tabALazyFetch.pkgBytes
        : 0,
      workerWasmBytes: Object.fromEntries(
        Object.entries(staged.releaseManifest.workers).map(([k, v]) => [
          k,
          v.bytes,
        ])
      ),
      yjsV1WasmMergeBytes: mergedByteLength,
    },
    dualTab: {
      tabAStatus400Plus: tabA404s.length,
      tabBStatus400Plus: tabB404s.length,
      tabALazyFontBytes: tabALazyFetch.fontBytes,
      tabALazyWasmStatus: tabALazyFetch.wasmStatus,
      tabADirectWasmStatus: tabALazyFetch.directWasmStatus,
      tabAPkgStatus: tabALazyFetch.pkgStatus,
      cspViolations: 0,
      crossShellLeaks: 0,
    },
    authRoutes: {
      verified: ['/sign-in', '/magic-link', '/oauth/callback'],
      mainShellTurnstileIsolated: true,
    },
    ssrOpenGraph: {
      publicDocPath,
      privateDocPath,
      crawlerHasOgTags: true,
      mobileHasOgTagsAndNativeShell: true,
      privateDocNoindex: true,
    },
    gpuDoubleCrashTakeover: {
      flushFailureAbortedNavigation: true,
      crash1RecoveredInPlace: true,
      crash2FallbackReason: crash2Takeover.legacyState.fallbackReason,
      recoveredDocsCount: afterReloadTakeover.legacyState.recoveredDocs.length,
      yjsV1BlocksFlavours: persistedDoc.flavours,
      yjsV1VisibleNoteIds: visibleNoteIds,
      yjsV1HiddenNoteExcluded: true,
      yjsV1ParagraphsVerifiedByTreeWalk: vParagraphs,
      yjsV1EditedViaRealLegacyUi: true,
      yjsV1WasmMergedBytes: mergedByteLength,
      zeroDataLoss: true,
    },
    multiDocRouteTargeting: {
      ambiguousMultiDocBlocksWrite: true,
      routeTargetedDocId: 'z-active',
      zActiveParagraphsAfterReload: docZActive?.paragraphs || [],
      aOtherUntouchedParagraphs: docAOther?.paragraphs || [],
    },
  };

  if (outDir) {
    writeFileSync(
      join(outDir, 's5-canary-dual-shell-report.json'),
      JSON.stringify(report, null, 2) + '\n'
    );
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const tab of openTabs) {
    tab.close();
  }
  if (chromeProc && chromeProc.pid) {
    try {
      process.kill(chromeProc.pid, 'SIGTERM');
    } catch {
      // Already exited.
    }
  }
  if (serverProc && serverProc.pid) {
    try {
      process.kill(serverProc.pid, 'SIGTERM');
    } catch {
      // Already exited.
    }
  }
  rmSync(workTmp, { recursive: true, force: true });
}
