#!/usr/bin/env node
// Real-browser Headless Chromium E2E against the exact `affine-release web bundle`
// served by `wrangler@4.168.0 dev` (`workerd`) + local mock upstream auth server:
//   1) `/`     : editable first frame + text readback + RaTeX RGBA light/dark + in-document
//                2-page Hayro PDF attachment card rendered live by `pdf-worker.<hash>.wasm`.
//   2) `/host/`: production default `bootWebHost()` binding (`window.__AFFINE_WEB_HOST__`
//                `attachWorkspace(...).v1Reader`, ZERO manual Wasm import or `setCrdtCodecs`
//                override!) reading 2-frame Yjs v1 `affine-local` IndexedDB + `'live-guid'`.
//   3) `/sign-in`: cross-origin hidden OAuth + password + 6-digit OTP -> `/api/auth/session`.
// Kills temporary Chromium by exact PID in `finally`.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , workerdBaseUrl, outDir] = process.argv;
if (!workerdBaseUrl || !outDir) {
  console.error(
    'Usage: node verify-workerd-bundle-e2e.mjs <workerdBaseUrl> <outDir>'
  );
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const b of candidates) {
    if (fs.existsSync(b)) return b;
  }
  const pw = path.join(os.homedir(), '.cache/ms-playwright');
  if (fs.existsSync(pw)) {
    const found = execFileSync('find', [pw, '-name', 'chrome', '-type', 'f'], {
      encoding: 'utf8',
    })
      .split('\n')
      .map(s => s.trim())
      .find(Boolean);
    if (found) return found;
  }
  throw new Error('No preinstalled Chromium found');
}

// Two real binary Yjs v1 update frames:
// - frame1 creates `meta.pages` (`Live Page`) + `spaces.p1` (`old-guid`) + `otherMap.foreign`
// - frame2 replaces `spaces.p1` with subdoc `'live-guid'` and deletes `'old-guid'`
const REAL_YJS_V1_FRAMES = {
  frame1: [
    1, 6, 105, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7,
    0, 105, 0, 1, 40, 0, 105, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0, 105, 1,
    5, 116, 105, 116, 108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80, 97, 103,
    101, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112, 49, 8, 111, 108, 100, 45,
    103, 117, 105, 100, 118, 0, 41, 1, 8, 111, 116, 104, 101, 114, 77, 97, 112,
    7, 102, 111, 114, 101, 105, 103, 110, 12, 102, 111, 114, 101, 105, 103, 110,
    45, 103, 117, 105, 100, 118, 0, 0,
  ],
  frame2: [
    1, 1, 105, 6, 169, 105, 4, 9, 108, 105, 118, 101, 45, 103, 117, 105, 100,
    118, 0, 1, 105, 1, 4, 1,
  ],
};

// Valid 2-page PDF (page 1 vivid crimson banner + white bar, page 2 cobalt blue)
// rendered inside `/` by `pdf-worker.<hash>.wasm` (Hayro).
function buildTwoPagePdfBytes() {
  const s1 =
    '0.95 0.96 0.99 rg 0 0 360 180 re f\n' +
    '0.82 0.16 0.24 rg 20 110 320 46 re f\n' +
    '0.18 0.24 0.34 rg 20 74 220 14 re f\n' +
    '0.42 0.48 0.58 rg 20 46 280 10 re f\n' +
    '0.42 0.48 0.58 rg 20 26 190 10 re f\n';
  const s2 =
    '0.94 0.97 1.00 rg 0 0 360 180 re f\n' +
    '0.12 0.38 0.86 rg 20 110 320 46 re f\n' +
    '0.18 0.24 0.34 rg 20 74 240 14 re f\n';
  const rawObjs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 360 180] /Contents 4 0 R >> endobj\n',
    `4 0 obj << /Length ${s1.length} >> stream\n${s1}endstream endobj\n`,
    '5 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 360 180] /Contents 6 0 R >> endobj\n',
    `6 0 obj << /Length ${s2.length} >> stream\n${s2}endstream endobj\n`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of rawObjs) {
    offsets.push(Buffer.byteLength(out, 'ascii'));
    out += obj;
  }
  const xrefOffset = Buffer.byteLength(out, 'ascii');
  out += `xref\n0 ${rawObjs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= rawObjs.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer << /Size ${rawObjs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Array.from(Buffer.from(out, 'ascii'));
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-workerd-e2e-'));
const chromeBin = findChrome();
const chrome = spawn(
  chromeBin,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,800',
    'about:blank',
  ],
  {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'disabled:' },
  }
);

let exitCode = 0;
try {
  const debugPort = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Timed out waiting for DevTools URL: ${stderr.slice(-400)}`)
        ),
      45000
    );
    chrome.stderr.on('data', chunk => {
      stderr += chunk.toString();
      const m = stderr.match(
        /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//
      );
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
  });

  const target = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
      method: 'PUT',
    })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 0;
  const pending = new Map();
  const uncaughtErrors = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.rej(new Error(JSON.stringify(msg.error)));
      else entry.res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      uncaughtErrors.push(
        msg.params?.exceptionDetails?.exception?.description ||
          msg.params?.exceptionDetails?.text ||
          'Runtime.exceptionThrown'
      );
    }
  };

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evalJs = async expression => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description || res.exceptionDetails.text
      );
    }
    return res.result.value;
  };

  const saveShot = async filename => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`[shot] saved ${outPath} (${buf.byteLength} bytes)`);
    return buf;
  };

  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await sleep(140);
  };

  const pressKey = async (key, code, vk) => {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type,
        key,
        code,
        windowsVirtualKeyCode: vk,
      });
    }
    await sleep(100);
  };

  const typeText = async text => {
    for (const ch of text) {
      await send('Input.insertText', { text: ch });
      await sleep(20);
    }
    await sleep(120);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // =========================================================================
  // 1. `/` — Editable First Frame + RaTeX RGBA + Real In-Document 2-Page PDF
  // =========================================================================
  console.log(
    '=== [1/3] Verifying `/` on workerd bundle (text input, RaTeX RGBA, in-document 2-page PDF) ==='
  );
  await send('Page.navigate', { url: `${workerdBaseUrl}/` });
  for (let i = 0; i < 160; i++) {
    const state = await evalJs(
      '({ ready: Boolean(window.__playgroundReady), error: window.__playgroundError || null })'
    );
    if (state.error) throw new Error(`Playground boot error: ${state.error}`);
    if (state.ready) break;
    await sleep(250);
  }
  assert.equal(
    await evalJs('Boolean(window.__playgroundReady)'),
    true,
    '`/` must reach window.__playgroundReady === true'
  );
  await sleep(1800);

  await click(314, 215);
  await pressKey('End', 'End', 35);
  await pressKey('Enter', 'Enter', 13);
  await typeText('Workerd E2E Verified: Euler $$e^{i\\pi}+1=0$$ ');
  await typeText('and fraction $$\\frac{a}{b}$$ ');
  await typeText('inline.');
  const readback1 = await evalJs(
    "(() => { const t = document.querySelector('textarea'); return t ? t.value : ''; })()"
  );
  console.log('[1/3] paragraph textarea readback:', JSON.stringify(readback1));
  assert.ok(readback1.includes('Workerd E2E Verified:'));

  await pressKey('Enter', 'Enter', 13);
  await typeText('$$$$ ');
  await sleep(300);
  await typeText('\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}');
  await sleep(400);
  await pressKey('Enter', 'Enter', 13);
  await sleep(3500);
  const lightMathBuf = await saveShot('workerd-01-editor-math-light.png');

  await click(1252, 26);
  await sleep(2500);
  await saveShot('workerd-02-editor-math-dark.png');

  // Return to Light mode, insert a real 2-page embedded PDF attachment block into `/`,
  // wait for `pdf-worker.<hash>.wasm` (Hayro) to rasterize page 1 onto the WebGL/WebGPU canvas,
  // and capture `workerd-04-editor-pdf.png`!
  await click(1252, 26);
  await sleep(1200);
  const twoPagePdf = buildTwoPagePdfBytes();
  const workerAssetsCheck = await evalJs(`(async () => {
    const assets = window.__AFFINE_WORKER_ASSETS__ || {};
    const mathRes = await fetch(assets.mathWasm);
    const pdfRes = await fetch(assets.pdfWasm);
    const pdfBytes = Uint8Array.from(${JSON.stringify(twoPagePdf)});
    window.__playgroundPreview.deliverPdfAttachment(pdfBytes, 'architecture-spec-2p.pdf');
    return {
      mathWasm: assets.mathWasm,
      mathStatus: mathRes.status,
      mathBytes: (await mathRes.arrayBuffer()).byteLength,
      pdfWasm: assets.pdfWasm,
      pdfStatus: pdfRes.status,
      pdfBytes: (await pdfRes.arrayBuffer()).byteLength,
    };
  })()`);
  await sleep(3500);
  const pdfShotBuf = await saveShot('workerd-04-editor-pdf.png');
  const pdfPixelCheck = await evalJs(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${pdfShotBuf.toString('base64')}';
    await img.decode();
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, off.width, off.height);
    let redBannerPixels = 0;
    let navyBarPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Page 1 content stream draws a crimson banner (0.80, 0.16, 0.22) and navy bar (0.15, 0.22, 0.32).
      if (r >= 170 && g <= 65 && b <= 80) redBannerPixels += 1;
      if (r >= 25 && r <= 55 && g >= 40 && g <= 72 && b >= 65 && b <= 100) navyBarPixels += 1;
    }
    return { width, height, redBannerPixels, navyBarPixels };
  })()`);
  console.log(
    '[1/3] worker assets & PDF pixel check:',
    JSON.stringify({ ...workerAssetsCheck, ...pdfPixelCheck })
  );
  assert.match(
    workerAssetsCheck.mathWasm,
    /^\/assets\/math-worker\.[0-9a-f]{12}\.wasm$/
  );
  assert.equal(workerAssetsCheck.mathStatus, 200);
  assert.match(
    workerAssetsCheck.pdfWasm,
    /^\/assets\/pdf-worker\.[0-9a-f]{12}\.wasm$/
  );
  assert.equal(workerAssetsCheck.pdfStatus, 200);
  assert.notEqual(
    Buffer.compare(lightMathBuf, pdfShotBuf),
    0,
    'Embedded 2-page PDF rendered by pdf-worker.wasm must visibly update the editor canvas'
  );
  assert.ok(
    pdfPixelCheck.redBannerPixels >= 2000 && pdfPixelCheck.navyBarPixels >= 500,
    `PDF page 1 crimson banner and navy bar must be rasterized onto canvas (got ${JSON.stringify(pdfPixelCheck)})`
  );

  // =========================================================================
  // 2. `/host/` — Production Default `bootWebHost()` Binding (NO manual Wasm override!)
  // =========================================================================
  console.log(
    '=== [2/3] Verifying `/host/` default bootWebHost() v1Reader without manual setCrdtCodecs ==='
  );
  const fixtureFramesJson =
    process.env.IDB_TWO_FRAMES_JSON || JSON.stringify(REAL_YJS_V1_FRAMES);
  await send('Page.navigate', { url: `${workerdBaseUrl}/host/` });
  for (let i = 0; i < 60; i++) {
    const booted = await evalJs(
      'Boolean(window.__AFFINE_WEB_HOST__ && typeof window.__AFFINE_WEB_HOST__.attachWorkspace === "function")'
    );
    if (booted) break;
    await sleep(150);
  }
  await sleep(600);

  const hostResult = await evalJs(`(async () => {
    const manifestEl = document.getElementById('affine-build-manifest');
    if (!manifestEl) throw new Error('Missing #affine-build-manifest on /host/');
    const manifest = JSON.parse(manifestEl.textContent);
    if ('crdtCodecWasm' in manifest) {
      throw new Error('crdtCodecWasm must be absent from rewritten manifest');
    }
    if (!manifest.mainWasmJs || !/^\\/pkg\\/playground\\.[0-9a-f]{12}\\.js$/.test(manifest.mainWasmJs)) {
      throw new Error('Unexpected mainWasmJs: ' + manifest.mainWasmJs);
    }

    const canvasCountBefore = document.querySelectorAll('canvas').length;
    const host = window.__AFFINE_WEB_HOST__;
    if (!host || typeof host.attachWorkspace !== 'function') {
      throw new Error('Expected booted window.__AFFINE_WEB_HOST__ handle on /host/');
    }

    // Seed real V1 affine-local IndexedDB with 2 Yjs v1 frames + live/stale/foreign subdocs,
    // then read exclusively through host.attachWorkspace(...).v1Reader (testing the shipping
    // bootWebHost() default mainWasmJs binding with zero manual Wasm import or setCrdtCodecs).
    const framesData = ${fixtureFramesJson};
    const frame1 = Uint8Array.from(framesData.frame1);
    const frame2 = Uint8Array.from(framesData.frame2);
    const enc = new TextEncoder();

    const v1Db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('affine-local', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('workspace')) {
          req.result.createObjectStore('workspace', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = v1Db.transaction('workspace', 'readwrite');
    const store = tx.objectStore('workspace');
    store.put({
      id: 'ws-v1-workerd',
      updates: [
        { timestamp: 100, update: frame1 },
        { timestamp: 101, update: frame2 },
      ],
    });
    store.put({
      id: 'live-guid',
      updates: [{ timestamp: 200, update: enc.encode('live-subdoc-body') }],
    });
    store.put({
      id: 'old-guid',
      updates: [{ timestamp: 200, update: enc.encode('deleted-subdoc-body') }],
    });
    store.put({
      id: 'foreign-guid',
      updates: [{ timestamp: 200, update: enc.encode('foreign-subdoc-body') }],
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('v1 seed tx aborted'));
    });
    v1Db.close();

    const { workspaceStorage, v1Reader } = host.attachWorkspace({
      flavour: 'local',
      type: 'workspace',
      id: 'ws-v1-workerd',
    });
    const listedDocIds = await v1Reader.listV1DocIds();
    const mergedRoot = await v1Reader.getV1Doc('ws-v1-workerd');
    const canvasCountAfter = document.querySelectorAll('canvas').length;
    workspaceStorage.close();

    return {
      manifestKeys: Object.keys(manifest).sort(),
      mainWasmJs: manifest.mainWasmJs,
      canvasCountBefore,
      canvasCountAfter,
      listedDocIds,
      mergedRootBytes: mergedRoot?.bin?.byteLength ?? 0,
    };
  })()`);
  console.log(
    '[2/3] /host/ default-binding result:',
    JSON.stringify(hostResult)
  );
  assert.equal(hostResult.canvasCountBefore, 1);
  assert.equal(
    hostResult.canvasCountAfter,
    1,
    'Default bootWebHost() mainWasmJs binding on /host/ must not mount a second canvas'
  );
  assert.equal(hostResult.mergedRootBytes, 134);
  assert.deepEqual(hostResult.listedDocIds, ['ws-v1-workerd', 'live-guid']);

  // =========================================================================
  // 3. `/sign-in` — Cross-Origin Proxy: Hidden OAuth + Password + 6-Digit OTP
  // =========================================================================
  console.log(
    '=== [3/3] Verifying `/sign-in` password & 6-digit OTP sign-in via workerd proxy ==='
  );
  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: `${workerdBaseUrl}/sign-in` });
  for (let i = 0; i < 60; i++) {
    const ready = await evalJs("Boolean(document.querySelector('#email'))");
    if (ready) break;
    await sleep(150);
  }
  await sleep(600);

  const oauthCheck = await evalJs(`(() => {
    const container = document.getElementById('oauth-providers');
    const visibleButtons = Array.from(document.querySelectorAll('[data-provider], #oauth-providers button'))
      .filter(el => !el.hidden && getComputedStyle(el).display !== 'none');
    return {
      containerHidden: container ? (container.hidden || getComputedStyle(container).display === 'none') : true,
      visibleCount: visibleButtons.length,
    };
  })()`);
  console.log('[3/3] cross-origin OAuth check:', JSON.stringify(oauthCheck));
  assert.equal(oauthCheck.visibleCount, 0);
  await saveShot('workerd-03-signin-email-step.png');

  await evalJs(`(() => {
    const el = document.querySelector('#email');
    el.focus();
    el.value = 'pw@affine.fail';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#sign-in-form').requestSubmit();
  })()`);
  for (let i = 0; i < 40; i++) {
    const step = await evalJs(
      "document.querySelector('#auth-card')?.dataset?.step || ''"
    );
    if (step === 'password') break;
    await sleep(100);
  }
  assert.equal(
    await evalJs("document.querySelector('#auth-card')?.dataset?.step || ''"),
    'password'
  );
  await evalJs(`(() => {
    const pw = document.querySelector('#password');
    pw.focus();
    pw.value = 'correct-horse-battery';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#sign-in-form').requestSubmit();
  })()`);
  for (let i = 0; i < 60; i++) {
    if ((await evalJs('window.location.pathname')) === '/') break;
    await sleep(150);
  }
  assert.equal(await evalJs('window.location.pathname'), '/');
  const pwSession = await evalJs(
    "fetch('/api/auth/session', { credentials: 'same-origin' }).then(r => r.json())"
  );
  console.log(
    '[3/3] password /api/auth/session readback:',
    JSON.stringify(pwSession)
  );
  assert.equal(pwSession?.user?.email, 'pw@affine.fail');

  await send('Network.clearBrowserCookies');
  await send('Page.navigate', { url: `${workerdBaseUrl}/sign-in` });
  for (let i = 0; i < 40; i++) {
    if (await evalJs("Boolean(document.querySelector('#email'))")) break;
    await sleep(150);
  }
  await sleep(400);
  await evalJs(`(() => {
    const el = document.querySelector('#email');
    el.focus();
    el.value = 'otp@affine.fail';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#sign-in-form').requestSubmit();
  })()`);
  for (let i = 0; i < 40; i++) {
    if (
      (await evalJs(
        "document.querySelector('#auth-card')?.dataset?.step || ''"
      )) === 'otp'
    ) {
      break;
    }
    await sleep(100);
  }
  assert.equal(
    await evalJs("document.querySelector('#auth-card')?.dataset?.step || ''"),
    'otp'
  );
  await sleep(300);
  await evalJs(`(() => {
    const otp = document.querySelector('#otp');
    otp.focus();
    otp.value = '654321';
    otp.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#sign-in-form').requestSubmit();
  })()`);
  for (let i = 0; i < 60; i++) {
    if ((await evalJs('window.location.pathname')) === '/') break;
    await sleep(150);
  }
  assert.equal(await evalJs('window.location.pathname'), '/');
  const otpSession = await evalJs(
    "fetch('/api/auth/session', { credentials: 'same-origin' }).then(r => r.json())"
  );
  console.log(
    '[3/3] OTP /api/auth/session readback:',
    JSON.stringify(otpSession)
  );
  assert.equal(otpSession?.user?.email, 'otp@affine.fail');

  assert.deepEqual(
    uncaughtErrors,
    [],
    `Unexpected uncaught runtime exceptions: ${JSON.stringify(uncaughtErrors)}`
  );
  console.log('ALL WORKERD REAL-BROWSER E2E FLOWS PASSED');
  ws.close();
} catch (err) {
  console.error('WORKERD E2E FAILED:', err);
  exitCode = 1;
} finally {
  if (chrome.pid) {
    try {
      process.kill(chrome.pid, 'SIGKILL');
    } catch {}
  }
  try {
    fs.rmSync(profileDir, { recursive: true, force: true });
  } catch {}
}
process.exit(exitCode);
