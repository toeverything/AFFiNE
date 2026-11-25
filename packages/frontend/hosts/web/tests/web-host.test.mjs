import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyZeroThirdPartyJs } from '../scripts/verify-zero-third-party-js.mjs';
import {
  bootWebHost,
  buildLegacyFallbackUrl,
  createGpuRecoveryController,
  createSafeAreaTracker,
  createSandboxedEmbedIframe,
  detectGraphicsSupport,
  flushBeforeNavigation,
  focusImeInGesture,
  hideRuntimeFatal,
  isLegacyShellUrl,
  observeSafeAreaProbe,
  removeBootSkeleton,
  sanitizeEmbedSandbox,
  showBootFatal,
  validateEmbedSrc,
} from '../src/host.js';
import {
  buildPdfPageCacheKey,
  createPdfPreviewClient,
} from '../src/pdf-client.js';
import {
  attachImeSelectionGuard,
  computeSelectionOverlayLayout,
  createSelectionOverlayController,
  drawSelectionOverlay,
  executeClipboardAction,
} from '../src/selection-overlay.js';
import {
  bootSignInPage,
  classifyAuthRoute,
  maybeLoadTurnstile,
  submitSignInForm,
  TURNSTILE_SCRIPT_URL,
} from '../src/sign-in.js';
import {
  buildWorkerBootstrapSource,
  createWorkerLoader,
} from '../src/worker-loader.js';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOSTS_ROOT = resolve(WEB_ROOT, '..');

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

void test('static gate: zero package.json, wasm-safe CSP, and DOM whitelist', () => {
  const hostFiles = walkFiles(HOSTS_ROOT);
  const forbiddenPkg = hostFiles.filter(
    file => file.endsWith('/package.json') || file.endsWith('/yarn.lock')
  );
  assert.deepEqual(forbiddenPkg, []);

  const srcDir = join(WEB_ROOT, 'src');
  const srcFiles = walkFiles(srcDir).filter(file => file.endsWith('.js'));
  assert.ok(srcFiles.length >= 3);

  const importRe = /^\s*import\s+[^'"]*from\s+['"]([^'"]+)['"]/gm;
  const createElRe = /createElement\(\s*['"]([^'"]+)['"]\s*\)/g;
  const allowedTags = new Set(['canvas', 'iframe', 'script', 'div', 'button']);

  for (const file of srcFiles) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(importRe)) {
      const specifier = match[1];
      assert.ok(
        specifier.startsWith('./') || specifier.startsWith('../'),
        `${file}: external import "${specifier}" is forbidden`
      );
    }
    for (const match of text.matchAll(createElRe)) {
      const tag = match[1].toLowerCase();
      assert.ok(allowedTags.has(tag), `${file}: unexpected created tag ${tag}`);
      if (tag === 'script') {
        assert.ok(
          file.endsWith('/sign-in.js'),
          `script creation is only allowed in sign-in.js, found in ${file}`
        );
      }
      if (tag === 'button') {
        assert.ok(
          file.endsWith('/sign-in.js') || file.endsWith('/host.js'),
          `button creation is only allowed in sign-in.js or host.js, found in ${file}`
        );
      }
      if (tag === 'div') {
        assert.ok(
          file.endsWith('/a11y.js') || file.endsWith('/host.js'),
          `div creation is only allowed in a11y.js or host.js, found in ${file}`
        );
      }
    }
  }

  const indexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes("script-src 'self' 'wasm-unsafe-eval'"));
  assert.ok(!indexHtml.includes('challenges.cloudflare.com'));
  assert.ok(indexHtml.includes('<canvas id="app-canvas"'));
  assert.ok(indexHtml.includes('<textarea\n      id="ime"'));
  assert.ok(indexHtml.includes('font-size: 16px'));
  assert.ok(indexHtml.includes('touch-action: none'));
  assert.equal(
    (indexHtml.match(/id="safe-area-probe"/g) || []).length,
    1,
    'index.html must contain exactly one safe-area probe'
  );
  assert.ok(indexHtml.includes('<div id="embed-layer"></div>'));
  assert.ok(
    indexHtml.includes(
      '<div id="a11y-tree" role="application" aria-label="AFFiNE workspace"></div>'
    )
  );
  assert.ok(indexHtml.includes('"mermaid"'));
  assert.ok(indexHtml.includes('"math"'));
  assert.ok(indexHtml.includes('"typst"'));
  assert.ok(indexHtml.includes('"pdf"'));
  assert.ok(!indexHtml.includes('.woff2'));
  assert.ok(
    indexHtml.includes('<script type="module" src="/src/host.js"></script>')
  );
  assert.equal(
    new URL(
      '/src/host.js',
      'https://app.affine.pro/workspace/ws-1/doc-2'
    ).toString(),
    'https://app.affine.pro/src/host.js'
  );

  const signInHtml = readFileSync(join(WEB_ROOT, 'sign-in.html'), 'utf8');
  assert.ok(signInHtml.includes('autocomplete="username"'));
  assert.ok(signInHtml.includes('autocomplete="current-password"'));
  assert.ok(signInHtml.includes('autocomplete="one-time-code"'));
  assert.ok(
    signInHtml.includes('<script type="module" src="/src/sign-in.js"></script>')
  );
  assert.ok(
    !signInHtml.includes('<script src="https://challenges.cloudflare.com')
  );
  assert.ok(existsSync(join(WEB_ROOT, 'AGENTS.md')));
  assert.equal(
    readFileSync(join(WEB_ROOT, 'CLAUDE.md'), 'utf8').trim(),
    '@AGENTS.md'
  );
});

void test('safe-area probe notifies on left-to-right notch flip', () => {
  const seen = [];
  const tracker = createSafeAreaTracker(insets => seen.push(insets));

  assert.equal(tracker.update({ top: 0, right: 0, bottom: 0, left: 47 }), true);
  assert.equal(tracker.update({ top: 0, right: 47, bottom: 0, left: 0 }), true);
  assert.equal(
    tracker.update({ top: 0, right: 47, bottom: 0, left: 0 }),
    false
  );
  assert.equal(
    tracker.update({ top: 0, right: 47.5, bottom: 0, left: 0 }),
    true
  );

  assert.deepEqual(seen, [
    { top: 0, right: 0, bottom: 0, left: 47 },
    { top: 0, right: 47, bottom: 0, left: 0 },
    { top: 0, right: 47.5, bottom: 0, left: 0 },
  ]);

  let cssPadding = {
    'padding-top': '0px',
    'padding-right': '0px',
    'padding-bottom': '0px',
    'padding-left': '47px',
  };
  const listeners = new Map();
  const makeTarget = () => ({
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  });
  const fakeProbe = makeTarget();
  const fakeWin = {
    ...makeTarget(),
    visualViewport: makeTarget(),
    getComputedStyle: () => ({
      getPropertyValue: prop => cssPadding[prop] || '0px',
    }),
  };

  const domSeen = [];
  const obs = observeSafeAreaProbe(fakeWin, fakeProbe, v => domSeen.push(v));
  cssPadding = {
    'padding-top': '0px',
    'padding-right': '47px',
    'padding-bottom': '0px',
    'padding-left': '0px',
  };
  listeners.get('transitionrun')();
  obs.dispose();

  assert.deepEqual(domSeen, [
    { top: 0, right: 0, bottom: 0, left: 47 },
    { top: 0, right: 47, bottom: 0, left: 0 },
  ]);
});

void test('focusImeInGesture focuses #ime synchronously with 16px font', () => {
  const events = [];
  const fakeIme = {
    style: { fontSize: '12px' },
    readOnly: true,
    inputMode: '',
    enterKeyHint: '',
    focus(opts) {
      events.push({ type: 'focus', preventScroll: opts?.preventScroll });
    },
  };

  queueMicrotask(() => events.push({ type: 'microtask' }));
  const ok = focusImeInGesture(fakeIme, {
    inputMode: 'text',
    enterKeyHint: 'done',
  });

  assert.equal(ok, true);
  assert.equal(fakeIme.style.fontSize, '16px');
  assert.equal(fakeIme.readOnly, false);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { type: 'focus', preventScroll: true });
});

void test('flushBeforeNavigation aborts on flush failure and navigates on success', async () => {
  const calls = [];
  const failed = await flushBeforeNavigation({
    pauseInput: () => calls.push('pause'),
    flushPendingWrites: async () => {
      calls.push('flush-fail');
      throw new Error('offline-idb-locked');
    },
    navigate: url => calls.push(`nav:${url}`),
    resumeInput: () => calls.push('resume'),
    targetUrl: '/sign-in',
  });

  assert.equal(failed.navigated, false);
  assert.ok(failed.reason?.includes('offline-idb-locked'));
  assert.deepEqual(calls, ['pause', 'flush-fail', 'resume']);

  const okCalls = [];
  const succeeded = await flushBeforeNavigation({
    pauseInput: () => okCalls.push('pause'),
    flushPendingWrites: async () => {
      okCalls.push('flush-ok');
      return { ok: true };
    },
    navigate: url => okCalls.push(`nav:${url}`),
    targetUrl: '/sign-in',
  });

  assert.deepEqual(succeeded, { navigated: true });
  assert.deepEqual(okCalls, ['pause', 'flush-ok', 'nav:/sign-in']);
});

void test('offscreen GPU probe, OAuth fallback loop guard, and strict embed CSP', async () => {
  let primaryCanvasTouched = false;
  let offscreenProbed = false;
  const fakeDoc = {
    createElement(tag) {
      if (tag === 'canvas') {
        offscreenProbed = true;
        return { getContext: () => null };
      }
      return {};
    },
    getElementById(id) {
      if (id === 'app-canvas') {
        return {
          getContext() {
            primaryCanvasTouched = true;
            return null;
          },
        };
      }
      if (id === 'boot') return { dataset: {} };
      if (id === 'boot-message') return { textContent: '' };
      if (id === 'ime') return { readOnly: false };
      return null;
    },
  };

  const graphics = detectGraphicsSupport(fakeDoc, {});
  assert.deepEqual(graphics, {
    webgpu: false,
    webgl2: false,
    supported: false,
  });
  assert.equal(offscreenProbed, true);
  assert.equal(primaryCanvasTouched, false);

  // Unconsumed OAuth code and state stay intact on initial GPU fallback.
  const preserved = buildLegacyFallbackUrl(
    'https://app.affine.pro/oauth/callback?code=once-123&state=s1&workspace=ws1#done'
  );
  assert.equal(preserved.oauthCodeStripped, false);
  const parsedPreserved = new URL(preserved.url);
  assert.equal(parsedPreserved.searchParams.get('shell'), 'legacy');
  assert.equal(parsedPreserved.searchParams.get('code'), 'once-123');
  assert.equal(parsedPreserved.searchParams.get('state'), 's1');
  assert.equal(parsedPreserved.hash, '#done');

  // Consumed OAuth code and state are both stripped on runtime GPU loss.
  const stripped = buildLegacyFallbackUrl(
    'https://app.affine.pro/oauth/callback?code=once-123&state=s1&workspace=ws1',
    { codeConsumed: true }
  );
  assert.equal(stripped.oauthCodeStripped, true);
  assert.equal(new URL(stripped.url).searchParams.has('code'), false);
  assert.equal(new URL(stripped.url).searchParams.has('state'), false);
  assert.equal(new URL(stripped.url).searchParams.get('workspace'), 'ws1');

  // Already on ?shell=legacy must show fatal error instead of redirect loop.
  assert.equal(isLegacyShellUrl('https://app.affine.pro/?shell=legacy'), true);
  const loopAssigned = [];
  const loopRes = await bootWebHost({
    win: {
      navigator: {},
      location: {
        href: 'https://app.affine.pro/?shell=legacy',
        assign: url => loopAssigned.push(url),
      },
    },
    doc: fakeDoc,
  });
  assert.equal(loopRes?.fatal, true);
  assert.equal(loopAssigned.length, 0);

  // Strict sandbox allowlist and CSP-aligned embed URL validation.
  assert.equal(
    sanitizeEmbedSandbox(
      'allow-scripts allow-same-origin allow-top-navigation allow-forms'
    ),
    'allow-scripts allow-forms'
  );
  assert.equal(sanitizeEmbedSandbox(undefined), 'allow-scripts');

  for (const allowed of ['blob:https://app.affine.pro/123', 'about:blank']) {
    assert.equal(validateEmbedSrc(allowed), allowed);
  }
  for (const rejected of [
    'https://example.com/embed',
    'http://localhost:8080/preview',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '',
  ]) {
    assert.throws(() => validateEmbedSrc(rejected));
  }

  const appended = [];
  const attrs = new Map();
  const embedDoc = {
    createElement: tag => ({
      tag,
      src: '',
      setAttribute: (k, v) => attrs.set(k, v),
    }),
  };
  createSandboxedEmbedIframe(
    embedDoc,
    { append: node => appended.push(node) },
    {
      src: 'blob:https://app.affine.pro/123',
      sandbox: 'allow-scripts allow-same-origin allow-top-navigation',
    }
  );
  assert.equal(appended.length, 1);
  assert.equal(attrs.get('sandbox'), 'allow-scripts');
});

void test('sign-in real /api/auth/captcha contract and JSON submit with captcha headers', async () => {
  const routes = [
    ['/sign-in', 'sign-in'],
    ['/magic-link', 'magic-link'],
    ['/oauth/callback', 'oauth'],
    ['/redirect-proxy', 'redirect-proxy'],
    ['/open-app/doc/123', 'open-app'],
  ];
  for (const [pathname, expected] of routes) {
    assert.equal(classifyAuthRoute(pathname), expected);
  }

  const injected = [];
  const fakeDoc = {
    head: { append: node => injected.push(node) },
    querySelectorAll: () => injected,
    createElement: tag => ({ tag, src: '', async: false, defer: false }),
  };
  const container = { dataset: {} };

  // No challenge (empty siteKey / 404).
  const skipped = await maybeLoadTurnstile({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({}),
    }),
    documentRef: fakeDoc,
    container,
  });
  assert.equal(skipped.loaded, false);
  assert.equal(injected.length, 0);

  // Real backend contract: { provider: 'turnstile', siteKey, action }.
  let capturedToken = null;
  const fakeWin = {
    turnstile: {
      render(_el, opts) {
        assert.equal(opts.sitekey, '0x4AAAAAA-real');
        assert.equal(opts.action, 'auth-sign-in');
        opts.callback('turnstile-token-xyz');
      },
    },
  };
  const loaded = await maybeLoadTurnstile({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        provider: 'turnstile',
        siteKey: '0x4AAAAAA-real',
        action: 'auth-sign-in',
      }),
    }),
    documentRef: fakeDoc,
    windowRef: fakeWin,
    container,
    onToken: tok => {
      capturedToken = tok;
    },
  });
  assert.deepEqual(loaded, {
    loaded: true,
    provider: 'turnstile',
    siteKey: '0x4AAAAAA-real',
    action: 'auth-sign-in',
  });
  assert.equal(capturedToken, 'turnstile-token-xyz');
  assert.equal(injected.length, 1);
  assert.equal(injected[0].src, TURNSTILE_SCRIPT_URL);

  // JSON submit with captcha headers.
  const requests = [];
  const res = await submitSignInForm({
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200 };
    },
    email: 'user@example.com',
    password: 'secret',
    captchaProvider: 'turnstile',
    captchaToken: capturedToken,
  });
  assert.deepEqual(res, { ok: true, status: 200, method: 'password' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers['content-type'], 'application/json');
  assert.equal(requests[0].init.headers['x-affine-client-kind'], 'web');
  assert.equal(requests[0].init.headers['x-captcha-provider'], 'turnstile');
  assert.equal(
    requests[0].init.headers['x-captcha-token'],
    'turnstile-token-xyz'
  );

  // Full bootSignInPage submit interception without challenge.
  const formListeners = new Map();
  const signInPosts = [];
  const pageDoc = {
    head: { append() {} },
    querySelectorAll: () => [],
    createElement: tag => ({ tag }),
    getElementById(id) {
      if (id === 'sign-in-form') {
        return {
          getAttribute: () => '/api/auth/sign-in',
          addEventListener: (ev, fn) => formListeners.set(ev, fn),
        };
      }
      if (id === 'email') return { value: 'a@b.com' };
      if (id === 'password') return { value: 'pw' };
      if (id === 'auth-status') return { textContent: '' };
      return null;
    },
  };
  await bootSignInPage({
    win: {
      location: { pathname: '/sign-in' },
      fetch: async () => ({ ok: false }),
    },
    doc: pageDoc,
    fetchImpl: async (url, init) => {
      if (url === '/api/auth/captcha') {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      signInPosts.push({ url, init });
      return { ok: true, status: 200 };
    },
  });
  let prevented = false;
  await formListeners.get('submit')({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(signInPosts.length, 1);
  assert.equal(signInPosts[0].init.headers['x-captcha-token'], undefined);
});

void test('worker loader spawns 4 independent workers via blob bootstrap anchored to site root', async () => {
  const manifest = {
    shellVersion: 'mobile-v1',
    buildHash: 'abc1234',
    workers: {
      mermaid: {
        script: '/assets/mermaid-worker.abc1234.js',
        wasm: '/assets/mermaid-worker.abc1234.wasm',
      },
      math: {
        script: '/assets/math-worker.abc1234.js',
        wasm: '/assets/math-worker.abc1234.wasm',
      },
      typst: {
        script: '/assets/typst-worker.abc1234.js',
        wasm: '/assets/typst-worker.abc1234.wasm',
      },
      pdf: {
        script: '/assets/pdf-worker.abc1234.js',
        wasm: '/assets/pdf-worker.abc1234.wasm',
      },
    },
    fonts: {
      cjk: './assets/fonts/noto-cjk.ttf',
    },
  };

  const created = [];
  const blobs = [];
  const loader = createWorkerLoader(manifest, {
    baseUrl: 'https://app.affine.pro/workspace/ws-123/doc-456',
    createObjectURL: blob => {
      blobs.push(blob);
      return `blob:https://app.affine.pro/worker-${blobs.length}`;
    },
    createWorker: (url, opts) => {
      const worker = { url, opts };
      created.push(worker);
      return worker;
    },
    fetchImpl: async url => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(url).buffer,
    }),
  });

  // Mutating caller object cannot alter frozen manifest.
  manifest.buildHash = 'mutated';

  // Nested route /workspace/ws-123/doc-456 must resolve to site root /assets/...
  assert.deepEqual(loader.resolveWorkerAssets('mermaid'), {
    script: 'https://app.affine.pro/assets/mermaid-worker.abc1234.js',
    wasm: 'https://app.affine.pro/assets/mermaid-worker.abc1234.wasm',
  });
  assert.deepEqual(loader.resolveWorkerAssets('math'), {
    script: 'https://app.affine.pro/assets/math-worker.abc1234.js',
    wasm: 'https://app.affine.pro/assets/math-worker.abc1234.wasm',
  });
  assert.deepEqual(loader.resolveWorkerAssets('typst'), {
    script: 'https://app.affine.pro/assets/typst-worker.abc1234.js',
    wasm: 'https://app.affine.pro/assets/typst-worker.abc1234.wasm',
  });
  assert.deepEqual(loader.resolveWorkerAssets('pdf'), {
    script: 'https://app.affine.pro/assets/pdf-worker.abc1234.js',
    wasm: 'https://app.affine.pro/assets/pdf-worker.abc1234.wasm',
  });
  assert.equal(
    loader.resolveFontUrl('cjk'),
    'https://app.affine.pro/assets/fonts/noto-cjk.ttf?v=abc1234'
  );

  const w1 = loader.loadWorker('mermaid');
  const w2 = loader.loadWorker('mermaid');
  assert.equal(w1, w2);
  assert.equal(created.length, 1);
  assert.ok(created[0].url.startsWith('blob:'));
  const bootstrapText = await blobs[0].text();
  assert.ok(
    bootstrapText.includes('AFFINE_HOST_ORIGIN = "https://app.affine.pro"')
  );
  assert.ok(bootstrapText.includes('mermaid-worker.abc1234.wasm'));
  assert.ok(
    bootstrapText.includes(
      'await import("https://app.affine.pro/assets/mermaid-worker.abc1234.js")'
    )
  );
});

void test('worker bootstrap dynamic await import exposes globals before child evaluation and replays early messages', async () => {
  const childSource = [
    'globalThis.__AFFINE_WORKER_CHILD_SEEN__ = {',
    '  origin: globalThis.AFFINE_HOST_ORIGIN,',
    '  wasm: globalThis.AFFINE_WORKER_WASM_URL,',
    '  messages: [],',
    '};',
    "globalThis.addEventListener('message', ev => {",
    '  globalThis.__AFFINE_WORKER_CHILD_SEEN__.messages.push(ev.data);',
    '});',
  ].join('\n');
  const childDataUrl = `data:text/javascript;base64,${Buffer.from(childSource).toString('base64')}`;
  const bootstrap = buildWorkerBootstrapSource(
    'https://app.affine.pro',
    childDataUrl,
    'https://app.affine.pro/assets/mermaid-worker.abc1234.wasm'
  );
  const bootstrapUrl = `data:text/javascript;base64,${Buffer.from(bootstrap).toString('base64')}`;

  delete globalThis.AFFINE_HOST_ORIGIN;
  delete globalThis.AFFINE_WORKER_WASM_URL;
  delete globalThis.__AFFINE_WORKER_CHILD_SEEN__;

  const origAdd = globalThis.addEventListener;
  const origRemove = globalThis.removeEventListener;
  const origDispatch = globalThis.dispatchEvent;
  const listeners = new Set();
  let sentEarly = false;
  globalThis.addEventListener = (_t, fn) => {
    listeners.add(fn);
    if (!sentEarly) {
      sentEarly = true;
      // Simulate a message arriving after bootstrap registers its queue listener
      // and while `await import(childDataUrl)` is in flight.
      queueMicrotask(() => {
        globalThis.dispatchEvent(
          new MessageEvent('message', { data: { id: 99, early: true } })
        );
      });
    }
  };
  globalThis.removeEventListener = (_t, fn) => listeners.delete(fn);
  globalThis.dispatchEvent = ev => {
    for (const fn of listeners) fn(ev);
    return true;
  };

  try {
    await import(bootstrapUrl);

    assert.deepEqual(globalThis.__AFFINE_WORKER_CHILD_SEEN__, {
      origin: 'https://app.affine.pro',
      wasm: 'https://app.affine.pro/assets/mermaid-worker.abc1234.wasm',
      messages: [{ id: 99, early: true }],
    });
  } finally {
    globalThis.addEventListener = origAdd;
    globalThis.removeEventListener = origRemove;
    globalThis.dispatchEvent = origDispatch;
    delete globalThis.AFFINE_HOST_ORIGIN;
    delete globalThis.AFFINE_WORKER_WASM_URL;
    delete globalThis.__AFFINE_WORKER_CHILD_SEEN__;
  }
});

void test('index.html default-app-entry paints first frame on #app-canvas before removing #boot and tracks OAuth/GPU loss', async () => {
  const indexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
  const manifestMatch = indexHtml.match(
    /<script id="affine-build-manifest" type="application\/json">([\s\S]*?)<\/script>/
  );
  assert.ok(manifestMatch, 'index.html must embed #affine-build-manifest');
  const manifestJson = manifestMatch[1].trim();
  const parsedManifest = JSON.parse(manifestJson);
  assert.equal(parsedManifest.appEntryJs, '/src/default-app-entry.js');

  let probeWidth = 0;
  let probeHeight = 0;
  let loseContextCalls = 0;
  let bootRemoved = false;
  let primaryContextRequests = 0;
  let primaryClearCalls = 0;
  let bootRemovedAtClearTime = null;
  const canvasListeners = new Map();
  const newCanvasListeners = new Map();
  const makeCanvas = listenerMap => ({
    width: 320,
    height: 640,
    getContext(kind) {
      primaryContextRequests += 1;
      if (kind === 'webgl2') {
        return {
          COLOR_BUFFER_BIT: 0x4000,
          clearColor() {},
          clear() {
            primaryClearCalls += 1;
            bootRemovedAtClearTime = bootRemoved;
          },
        };
      }
      return null;
    },
    addEventListener: (ev, fn) => listenerMap.set(ev, fn),
    removeEventListener: ev => listenerMap.delete(ev),
  });
  const initialCanvas = makeCanvas(canvasListeners);
  const replacementCanvas = makeCanvas(newCanvasListeners);

  const fakeDoc = {
    createElement(tag) {
      if (tag === 'canvas') {
        const probe = {
          set width(v) {
            probeWidth = v;
          },
          set height(v) {
            probeHeight = v;
          },
          getContext(kind) {
            if (kind === 'webgl2') {
              return {
                getExtension(name) {
                  assert.equal(name, 'WEBGL_lose_context');
                  return {
                    loseContext() {
                      loseContextCalls += 1;
                    },
                  };
                },
              };
            }
            return null;
          },
        };
        return probe;
      }
      return {};
    },
    getElementById(id) {
      if (id === 'affine-build-manifest') return { textContent: manifestJson };
      if (id === 'app-canvas') return initialCanvas;
      if (id === 'ime') return { readOnly: false };
      if (id === 'boot') {
        return {
          dataset: {},
          remove() {
            bootRemoved = true;
          },
        };
      }
      return null;
    },
    querySelectorAll: () => [],
  };

  const assignedUrls = [];
  const fakeWin = {
    navigator: {},
    location: {
      href: 'https://app.affine.pro/oauth/callback?code=live-code&state=s1',
      assign: url => assignedUrls.push(url),
    },
  };

  const handle = await bootWebHost({
    win: fakeWin,
    doc: fakeDoc,
    importModule: async specifier => {
      assert.equal(
        specifier,
        'https://app.affine.pro/src/default-app-entry.js'
      );
      globalThis.__AFFINE_WEB_HOST__ = fakeWin.__AFFINE_WEB_HOST__;
      try {
        await import('../src/default-app-entry.js');
      } finally {
        delete globalThis.__AFFINE_WEB_HOST__;
      }
    },
  });

  assert.equal(probeWidth, 1);
  assert.equal(probeHeight, 1);
  assert.equal(loseContextCalls, 1);
  assert.ok(primaryContextRequests >= 1);
  assert.equal(primaryClearCalls, 1);
  assert.equal(bootRemovedAtClearTime, false);
  assert.equal(bootRemoved, true);
  assert.ok(canvasListeners.has('webglcontextlost'));

  // An async entry that has not yet painted a frame must NOT have #boot prematurely removed.
  let unreadyBootRemoved = false;
  await bootWebHost({
    win: {
      navigator: {},
      location: {
        href: 'https://app.affine.pro/workspace/ws-1/doc-2',
        assign: () => {},
      },
    },
    doc: {
      ...fakeDoc,
      getElementById(id) {
        if (id === 'boot') {
          return {
            dataset: {},
            remove() {
              unreadyBootRemoved = true;
            },
          };
        }
        return fakeDoc.getElementById(id);
      },
    },
    importModule: async () => {},
  });
  assert.equal(unreadyBootRemoved, false);

  // Rebinding canvas moves the listener to the new canvas.
  handle.bindCanvas(replacementCanvas);
  assert.equal(canvasListeners.has('webglcontextlost'), false);
  assert.equal(newCanvasListeners.has('webglcontextlost'), true);

  // Before markOAuthCodeConsumed(), GPU loss preserves single-use OAuth code and state.
  await handle.handleRuntimeGpuLoss();
  assert.equal(assignedUrls.length, 1);
  assert.equal(new URL(assignedUrls[0]).searchParams.get('code'), 'live-code');
  assert.equal(new URL(assignedUrls[0]).searchParams.get('state'), 's1');
  assert.equal(new URL(assignedUrls[0]).searchParams.get('shell'), 'legacy');

  // After markOAuthCodeConsumed(), WebGPU device.lost on a fresh host strips both code and state.
  const handle2 = await bootWebHost({
    win: fakeWin,
    doc: fakeDoc,
    importModule: async () => {},
  });
  handle2.markOAuthCodeConsumed();
  let resolveLost;
  const lostPromise = new Promise(r => {
    resolveLost = r;
  });
  handle2.bindWebGpuDevice({ lost: lostPromise });
  resolveLost({ reason: 'destroyed' });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(assignedUrls.length, 2);
  assert.equal(new URL(assignedUrls[1]).searchParams.has('code'), false);
  assert.equal(new URL(assignedUrls[1]).searchParams.has('state'), false);
  assert.equal(new URL(assignedUrls[1]).searchParams.get('shell'), 'legacy');
});

void test('default-app-entry falls back to legacy or fatal when navigator.gpu adapter and canvas contexts all fail', async () => {
  const indexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
  const manifestMatch = indexHtml.match(
    /<script id="affine-build-manifest" type="application\/json">([\s\S]*?)<\/script>/
  );
  const manifestJson = manifestMatch[1].trim();

  async function runWithNullContexts(href, tag) {
    const assigned = [];
    const bootEl = {
      dataset: { state: 'loading' },
      remove() {
        bootEl.removed = true;
      },
      removed: false,
    };
    const msgEl = { textContent: '' };
    const deadCanvas = {
      width: 320,
      height: 640,
      getContext: () => null,
      addEventListener() {},
      removeEventListener() {},
    };
    const fakeDoc = {
      createElement: () => ({ getContext: () => null }),
      getElementById(id) {
        if (id === 'affine-build-manifest')
          return { textContent: manifestJson };
        if (id === 'app-canvas') return deadCanvas;
        if (id === 'ime') return { readOnly: false };
        if (id === 'boot') return bootEl;
        if (id === 'boot-message') return msgEl;
        return null;
      },
      querySelectorAll: () => [],
    };
    const fakeWin = {
      navigator: {
        gpu: {
          requestAdapter: async () => null,
        },
      },
      location: {
        href,
        assign: url => assigned.push(url),
      },
    };

    const origNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: fakeWin.navigator,
      configurable: true,
    });
    try {
      await bootWebHost({
        win: fakeWin,
        doc: fakeDoc,
        importModule: async () => {
          globalThis.__AFFINE_WEB_HOST__ = fakeWin.__AFFINE_WEB_HOST__;
          try {
            await import(`../src/default-app-entry.js?null-ctx=${tag}`);
          } finally {
            delete globalThis.__AFFINE_WEB_HOST__;
          }
        },
      });
    } finally {
      if (origNav) {
        Object.defineProperty(globalThis, 'navigator', origNav);
      } else {
        delete globalThis.navigator;
      }
    }
    return { assigned, bootEl, msgEl };
  }

  // Case A: deep link with unconsumed OAuth code & state -> redirects to legacy preserving both.
  const caseA = await runWithNullContexts(
    'https://app.affine.pro/workspace/ws-1/doc-2?code=c1&state=s1',
    'case-a'
  );
  assert.equal(caseA.bootEl.removed, false);
  assert.equal(caseA.assigned.length, 1);
  const redir = new URL(caseA.assigned[0]);
  assert.equal(redir.searchParams.get('code'), 'c1');
  assert.equal(redir.searchParams.get('state'), 's1');
  assert.equal(redir.searchParams.get('shell'), 'legacy');

  // Case B: already on ?shell=legacy -> marks #boot fatal instead of hanging on loading.
  const caseB = await runWithNullContexts(
    'https://app.affine.pro/workspace/ws-1/doc-2?shell=legacy',
    'case-b'
  );
  assert.equal(caseB.assigned.length, 0);
  assert.equal(caseB.bootEl.dataset.state, 'fatal');
});

void test('sign-in cold-start Turnstile renders on async script load event and submits token', async () => {
  const scriptListeners = new Map();
  const injected = [];
  const formListeners = new Map();
  const posts = [];
  const fakeWin = {
    location: { pathname: '/sign-in' },
    fetch: async () => ({ ok: false }),
  };
  const fakeDoc = {
    head: { append: node => injected.push(node) },
    querySelectorAll: () => injected,
    createElement: tag => ({
      tag,
      src: '',
      async: false,
      defer: false,
      addEventListener: (ev, fn) => scriptListeners.set(ev, fn),
    }),
    getElementById(id) {
      if (id === 'turnstile-container') return { dataset: {} };
      if (id === 'sign-in-form') {
        return {
          getAttribute: () => '/api/auth/sign-in',
          addEventListener: (ev, fn) => formListeners.set(ev, fn),
        };
      }
      if (id === 'email') return { value: 'cold@affine.pro' };
      if (id === 'password') return { value: 'pw' };
      if (id === 'auth-status') return { textContent: '' };
      return null;
    },
  };

  const page = await bootSignInPage({
    win: fakeWin,
    doc: fakeDoc,
    fetchImpl: async (url, init) => {
      if (url === '/api/auth/captcha') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'turnstile',
            siteKey: '0x4AAAAAA-cold',
            action: 'sign-in',
          }),
        };
      }
      posts.push({ url, init });
      return { ok: true, status: 200 };
    },
  });

  // Before script finishes loading, token is still null and load listener is attached.
  assert.equal(page.getCaptchaToken(), null);
  assert.ok(scriptListeners.has('load'));

  // Simulate Cloudflare script finishing load and defining window.turnstile.
  fakeWin.turnstile = {
    render(_el, opts) {
      assert.equal(opts.sitekey, '0x4AAAAAA-cold');
      opts.callback('async-turnstile-token');
    },
  };
  scriptListeners.get('load')();
  assert.equal(page.getCaptchaToken(), 'async-turnstile-token');

  await formListeners.get('submit')({ preventDefault() {} });
  assert.equal(posts.length, 1);
  assert.equal(
    posts[0].init.headers['x-captcha-token'],
    'async-turnstile-token'
  );
  assert.equal(posts[0].init.headers['x-captcha-provider'], 'turnstile');
});

void test('gpu recovery controller restores WebGL2 context and trips IDB-flushed fallback on timeout, threshold, or WebGPU failure', async () => {
  let clock = 1000;
  let nextTimerId = 1;
  /** @type {Map<number, { fn: () => void, at: number }>} */
  const timers = new Map();
  const events = [];
  const navigated = [];
  let rebuildShouldSucceed = true;
  let webgl2FallbackOk = true;
  let flushOk = true;
  let pendingCount = 2;

  const controller = createGpuRecoveryController({
    getHref: () =>
      'https://app.affine.pro/workspace/ws-1/doc-2?code=abc&state=st1&tab=doc',
    isOAuthCodeConsumed: () => true,
    pauseInput: () => events.push('pause'),
    resumeInput: () => events.push('resume'),
    freezeFrameLoop: () => events.push('freeze'),
    unfreezeFrameLoop: () => events.push('unfreeze'),
    onContextRestored: () => {
      events.push('rebuild');
      return rebuildShouldSucceed;
    },
    tryWebGl2Fallback: () => {
      events.push('webgl2-fallback');
      return webgl2FallbackOk;
    },
    flushPendingWrites: async () => {
      events.push(`flush:${flushOk ? 'ok' : 'fail'}`);
      if (!flushOk) {
        return { ok: false, pendingCount };
      }
      pendingCount = 0;
      return { ok: true, pendingCount: 0 };
    },
    navigate: url => navigated.push(url),
    showFatal: msg => events.push(`fatal:${msg}`),
    restoreTimeoutMs: 4000,
    maxContextLosses: 3,
    lossWindowMs: 30_000,
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextTimerId++;
      timers.set(id, { fn, at: clock + ms });
      return id;
    },
    clearTimer: id => {
      timers.delete(/** @type {number} */ (id));
    },
  });

  // 1. Recoverable webglcontextlost -> webglcontextrestored without reload.
  let prevented = false;
  controller.handleWebGlContextLost({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(controller.getState().status, 'context-lost');
  assert.equal(controller.getState().inputPaused, true);
  assert.equal(controller.getState().frameLoopFrozen, true);
  assert.equal(timers.size, 1);

  const restoreRes = await controller.handleWebGlContextRestored();
  assert.deepEqual(restoreRes, { recovered: true });
  assert.equal(timers.size, 0);
  assert.equal(controller.getState().status, 'ready');
  assert.equal(controller.getState().inputPaused, false);
  assert.equal(controller.getState().frameLoopFrozen, false);
  assert.equal(navigated.length, 0);

  // 2. WebGPU device.lost downgrades to WebGL2 cleanly when available.
  const downgradeRes = await controller.handleWebGpuDeviceLost({
    reason: 'destroyed',
  });
  assert.deepEqual(downgradeRes, { recovered: true, mode: 'webgl2' });
  assert.equal(navigated.length, 0);

  // 3. Unrecoverable restore timeout with failing IDB flush aborts navigation and stays retryable.
  clock += 1000;
  flushOk = false;
  pendingCount = 2;
  controller.handleWebGlContextLost({ preventDefault() {} });
  assert.equal(timers.size, 1);
  const [timerEntry] = [...timers.values()];
  timers.clear();
  timerEntry.fn();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(navigated.length, 0);
  assert.equal(pendingCount, 2);
  assert.equal(controller.getState().status, 'fallback-blocked');
  assert.equal(controller.getState().retryable, true);

  // 4. Retrying fallback after IDB recovers persists pending writes and navigates to legacy.
  flushOk = true;
  const retryRes = await controller.retryFallback();
  assert.deepEqual(retryRes, { navigated: true });
  assert.equal(pendingCount, 0);
  assert.equal(navigated.length, 1);
  const target = new URL(navigated[0]);
  assert.equal(target.searchParams.get('shell'), 'legacy');
  assert.equal(target.searchParams.get('tab'), 'doc');
  assert.equal(target.searchParams.has('code'), false);
  assert.equal(target.searchParams.has('state'), false);

  // 5. Repeated context losses trip circuit breaker immediately at threshold.
  const thresholdNavs = [];
  const thresholdCtrl = createGpuRecoveryController({
    getHref: () => 'https://app.affine.pro/doc/1',
    isOAuthCodeConsumed: () => false,
    pauseInput() {},
    resumeInput() {},
    flushPendingWrites: async () => ({ ok: true, pendingCount: 0 }),
    navigate: url => thresholdNavs.push(url),
    maxContextLosses: 2,
    now: () => 5000,
    setTimer: () => 1,
    clearTimer() {},
  });
  assert.equal(
    thresholdCtrl.handleWebGlContextLost({ preventDefault() {} }).tripped,
    false
  );
  assert.equal(
    thresholdCtrl.handleWebGlContextLost({ preventDefault() {} }).tripped,
    true
  );
  await Promise.resolve();
  assert.equal(thresholdNavs.length, 1);
  assert.equal(new URL(thresholdNavs[0]).searchParams.get('shell'), 'legacy');

  // 6. WebGPU device.lost + WebGL2 fallback failure triggers legacy circuit breaker.
  const webgpuNavs = [];
  webgl2FallbackOk = false;
  const webgpuCtrl = createGpuRecoveryController({
    getHref: () => 'https://app.affine.pro/doc/2',
    isOAuthCodeConsumed: () => false,
    pauseInput() {},
    resumeInput() {},
    tryWebGl2Fallback: () => webgl2FallbackOk,
    flushPendingWrites: async () => ({ ok: true, pendingCount: 0 }),
    navigate: url => webgpuNavs.push(url),
  });
  const gpuLostRes = await webgpuCtrl.handleWebGpuDeviceLost({
    reason: 'unknown',
  });
  assert.equal(gpuLostRes.recovered, false);
  assert.equal(gpuLostRes.navigated, true);
  assert.equal(webgpuNavs.length, 1);
});

void test('selection overlay computes non-overlapping bidi handles, safe margins, drag state, and safe clipboard actions', async () => {
  // Table-driven geometry checks: LTR, RTL/bidi close carets, left/right viewport clamping, top flip.
  const cases = [
    {
      name: 'ltr-standard',
      input: {
        viewport: {
          width: 390,
          height: 844,
          safeArea: { top: 44, bottom: 34 },
        },
        rects: [{ x: 60, y: 200, width: 220, height: 24 }],
        caretStart: { x: 60, y: 200, height: 24, dir: 'ltr' },
        caretEnd: { x: 280, y: 200, height: 24, dir: 'ltr' },
      },
      expectedStartFlare: 'left',
      expectedEndFlare: 'right',
      expectedPlacement: 'above',
    },
    {
      name: 'rtl-close-carets-no-overlap',
      input: {
        viewport: { width: 390, height: 844 },
        rects: [{ x: 180, y: 220, width: 6, height: 22 }],
        caretStart: { x: 186, y: 220, height: 22, dir: 'rtl' },
        caretEnd: { x: 180, y: 220, height: 22, dir: 'rtl' },
      },
      expectedStartFlare: 'right',
      expectedEndFlare: 'left',
      expectedPlacement: 'above',
    },
    {
      name: 'top-edge-flips-below-and-clamps-left',
      input: {
        viewport: { width: 390, height: 844, safeArea: { top: 50, left: 0 } },
        rects: [{ x: 4, y: 58, width: 30, height: 22 }],
        caretStart: { x: 4, y: 58, height: 22 },
        caretEnd: { x: 34, y: 58, height: 22 },
      },
      expectedStartFlare: 'left',
      expectedEndFlare: 'right',
      expectedPlacement: 'below',
    },
  ];

  for (const tc of cases) {
    const layout = computeSelectionOverlayLayout(tc.input);
    assert.equal(layout.startHandle.flare, tc.expectedStartFlare, tc.name);
    assert.equal(layout.endHandle.flare, tc.expectedEndFlare, tc.name);
    assert.equal(layout.menu.placement, tc.expectedPlacement, tc.name);
    assert.equal(layout.menu.visible, true, tc.name);
    assert.ok(layout.menu.x >= 12, `${tc.name}: left margin >= 12px`);
    assert.ok(
      layout.menu.x + layout.menu.width <= tc.input.viewport.width - 12,
      `${tc.name}: right margin >= 12px`
    );
    const headDist = Math.abs(
      layout.endHandle.headCx - layout.startHandle.headCx
    );
    assert.ok(
      headDist >= layout.startHandle.radius * 2,
      `${tc.name}: teardrop heads must not overlap`
    );
  }

  // Dragging hides menu and shows loupe; pointerup restores menu and hides loupe.
  const actionsTriggered = [];
  const drags = [];
  const ctrl = createSelectionOverlayController({
    getInput: () => ({
      viewport: { width: 390, height: 844 },
      rects: [{ x: 60, y: 200, width: 200, height: 24 }],
      caretStart: { x: 60, y: 200, height: 24 },
      caretEnd: { x: 260, y: 200, height: 24 },
    }),
    onDragHandle: (handle, x, y) => drags.push({ handle, x, y }),
    onAction: action => actionsTriggered.push(action),
  });

  const initialLayout = ctrl.getLayout();
  assert.ok(initialLayout);
  const copyBtn = initialLayout.menu.items.find(i => i.id === 'copy');
  assert.ok(copyBtn);
  const cx = copyBtn.x + copyBtn.width / 2;
  const cy = copyBtn.y + copyBtn.height / 2;

  // Pointer down records press without firing action yet; sliding off cancels.
  const downSlide = ctrl.onPointerDown(cx, cy);
  assert.equal(downSlide.handled, true);
  assert.deepEqual(actionsTriggered, []);
  ctrl.onPointerMove(5, 800);
  const upSlide = ctrl.onPointerUp(5, 800);
  assert.equal(upSlide.cancelled, true);
  assert.deepEqual(actionsTriggered, []);

  // Pointer down + pointer up on same button fires action on pointerup.
  ctrl.onPointerDown(cx, cy);
  assert.deepEqual(actionsTriggered, []);
  const upConfirm = ctrl.onPointerUp(cx, cy);
  assert.equal(upConfirm.handled, true);
  assert.equal(upConfirm.action, 'copy');
  assert.deepEqual(actionsTriggered, ['copy']);

  // Pointer cancel clears pressed menu state without firing action.
  ctrl.onPointerDown(cx, cy);
  assert.equal(ctrl.onPointerCancel(), true);
  assert.equal(ctrl.getPressedMenuAction(), null);
  assert.deepEqual(actionsTriggered, ['copy']);

  const dragStart = ctrl.onPointerDown(
    initialLayout.endHandle.headCx,
    initialLayout.endHandle.headCy
  );
  assert.equal(dragStart.handled, true);
  assert.equal(ctrl.isDragging(), true);
  assert.equal(ctrl.getLayout().menu.visible, false);
  assert.equal(ctrl.getLayout().loupe.visible, true);
  ctrl.onPointerMove(280, 200);
  assert.equal(drags.length, 1);
  ctrl.onPointerUp();
  assert.equal(ctrl.isDragging(), false);
  assert.equal(ctrl.getLayout().menu.visible, true);
  assert.equal(ctrl.getLayout().loupe.visible, false);

  // Canvas 2D draw smoke test (ensures drawSelectionOverlay executes cleanly).
  const drawOps = [];
  const fakeCtx = new Proxy(
    {},
    {
      get(_target, prop) {
        return (...args) => drawOps.push([String(prop), args.length]);
      },
      set() {
        return true;
      },
    }
  );
  drawSelectionOverlay(/** @type {any} */ (fakeCtx), initialLayout, {
    theme: 'light',
  });
  assert.ok(drawOps.length > 10);

  // Clipboard Cut MUST NOT delete text if clipboard write fails.
  let docText = 'hello world';
  const failedCut = await executeClipboardAction({
    action: 'cut',
    getSelectedText: () => 'world',
    getSelectionToken: () => 'sel-6-11',
    deleteSelection: () => {
      docText = 'hello ';
    },
    isSecureContext: true,
    clipboard: {
      writeText: async () => {
        throw new Error('NotAllowedError');
      },
    },
  });
  assert.equal(failedCut.ok, false);
  assert.equal(docText, 'hello world');

  // Clipboard Cut deletes text only after writeText succeeds with a valid selection token.
  let copiedValue = '';
  const okCut = await executeClipboardAction({
    action: 'cut',
    getSelectedText: () => 'world',
    getSelectionToken: () => 'sel-6-11',
    deleteSelection: () => {
      docText = 'hello ';
    },
    isSecureContext: true,
    clipboard: {
      writeText: async text => {
        copiedValue = text;
      },
    },
  });
  assert.equal(okCut.ok, true);
  assert.equal(copiedValue, 'world');
  assert.equal(docText, 'hello ');

  // Non-HTTPS transient fallback clears #ime value after copy.
  const fakeIme = {
    readOnly: true,
    value: '',
    focus() {},
    setSelectionRange() {},
    addEventListener(type, fn) {
      this._listeners = this._listeners || new Map();
      this._listeners.set(type, fn);
    },
    removeEventListener(type) {
      this._listeners?.delete(type);
    },
  };
  const fallbackCopy = await executeClipboardAction({
    action: 'copy',
    getSelectedText: () => 'fallback-text',
    isSecureContext: false,
    clipboard: null,
    imeEl: /** @type {any} */ (fakeIme),
    doc: /** @type {any} */ ({ execCommand: cmd => cmd === 'copy' }),
  });
  assert.equal(fallbackCopy.ok, true);
  assert.equal(fallbackCopy.method, 'exec-command-fallback');
  assert.equal(fakeIme.value, '');
  assert.equal(fakeIme.readOnly, true);

  // IME selection guard blocks native menu only when overlay is active.
  let overlayActive = true;
  const guard = attachImeSelectionGuard(
    /** @type {any} */ (fakeIme),
    () => overlayActive
  );
  let menuPrevented = false;
  fakeIme._listeners.get('contextmenu')({
    preventDefault() {
      menuPrevented = true;
    },
  });
  assert.equal(menuPrevented, true);
  overlayActive = false;
  menuPrevented = false;
  fakeIme._listeners.get('contextmenu')({
    preventDefault() {
      menuPrevented = true;
    },
  });
  assert.equal(menuPrevented, false);
  guard.dispose();
});

void test('pdf client lazy-spawns worker, deduplicates in-flight renders, evicts offscreen LRU, and locks assetBaseUrl across tabs', async () => {
  // Dual-tab assetBaseUrl + buildId pinning.
  const pinnedLoader = createWorkerLoader(
    {
      shellVersion: 'mobile-v1',
      buildHash: 'ignored-hash',
      buildId: 'build-native-42',
      assetBaseUrl: 'https://app.affine.pro/shells/native-42/',
      workers: {
        mermaid: {
          script: '/src/workers/mermaid-worker.js',
          wasm: '/assets/mermaid-worker.wasm',
        },
        math: {
          script: '/src/workers/math-worker.js',
          wasm: '/assets/math-worker.wasm',
        },
        typst: {
          script: '/src/workers/typst-worker.js',
          wasm: '/assets/typst-worker.wasm',
        },
        pdf: {
          script: '/src/workers/pdf-worker.js',
          wasm: '/assets/pdf-worker.wasm',
        },
      },
      fonts: { latin: '/assets/fonts/inter.ttf' },
    },
    { baseUrl: 'https://app.affine.pro/workspace/ws-1/doc-9' }
  );
  assert.deepEqual(pinnedLoader.resolveWorkerAssets('pdf'), {
    script:
      'https://app.affine.pro/shells/native-42/src/workers/pdf-worker.js?v=build-native-42',
    wasm: 'https://app.affine.pro/shells/native-42/assets/pdf-worker.wasm?v=build-native-42',
  });
  assert.equal(
    pinnedLoader.resolveFontUrl('latin'),
    'https://app.affine.pro/shells/native-42/assets/fonts/inter.ttf?v=build-native-42'
  );

  // Lazy PDF client test with controllable mock worker.
  let spawnCount = 0;
  let terminated = false;
  const posted = [];
  /** @type {Set<(ev: { data: any }) => void>} */
  const msgListeners = new Set();

  const mockWorker = {
    postMessage(msg) {
      posted.push(msg);
    },
    addEventListener(type, fn) {
      if (type === 'message') msgListeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'message') msgListeners.delete(fn);
    },
    terminate() {
      terminated = true;
    },
  };

  const client = createPdfPreviewClient({
    workerLoader: {
      loadWorker(kind) {
        assert.equal(kind, 'pdf');
        spawnCount += 1;
        return mockWorker;
      },
      terminateWorker() {
        terminated = true;
        return true;
      },
    },
    maxCacheBytes: 32,
  });

  // Zero workers spawned before any PDF request.
  assert.equal(spawnCount, 0);
  assert.equal(client.getStats().workerSpawned, false);

  const emitResponse = data => {
    for (const fn of msgListeners) {
      fn({ data });
    }
  };

  // Concurrent duplicate requests for same (docKey, pageIndex, scale) share 1 RPC.
  const pdfBytes = new Uint8Array([37, 80, 68, 70]);
  const r1 = client.renderPage({
    docKey: 'doc-pdf',
    pdfBytes,
    pageIndex: 0,
    scale: 1,
  });
  const r2 = client.renderPage({
    docKey: 'doc-pdf',
    pdfBytes,
    pageIndex: 0,
    scale: 1,
  });
  const r3 = client.renderPage({
    docKey: 'doc-pdf',
    pdfBytes,
    pageIndex: 1,
    scale: 1,
  });

  assert.equal(spawnCount, 1);
  assert.equal(posted.length, 2);
  assert.equal(client.getStats().dedupHits, 1);

  // Resolve out-of-order to verify requestId multiplexing.
  emitResponse({
    id: posted[1].id,
    ok: true,
    result: {
      pageCount: 3,
      widthPx: 2,
      heightPx: 2,
      rgba: new Uint8Array(16).fill(200),
    },
  });
  emitResponse({
    id: posted[0].id,
    ok: true,
    result: {
      pageCount: 3,
      widthPx: 2,
      heightPx: 2,
      rgba: new Uint8Array(16).fill(100),
    },
  });

  const [page0a, page0b, page1] = await Promise.all([r1, r2, r3]);
  assert.equal(page0a.pageCount, 3);
  assert.equal(page0b.rgba[0], 100);
  assert.equal(page1.rgba[0], 200);
  assert.equal(client.getStats().cacheBytes, 32);

  // Page count is already cached (0 extra worker RPCs).
  assert.equal(await client.getPageCount({ docKey: 'doc-pdf', pdfBytes }), 3);
  assert.equal(posted.length, 2);

  // Protect page 0 as visible; rendering page 2 evicts offscreen page 1 first.
  client.setVisibleKeys([buildPdfPageCacheKey('doc-pdf', 0, 1)]);
  const r4 = client.renderPage({
    docKey: 'doc-pdf',
    pdfBytes,
    pageIndex: 2,
    scale: 1,
  });
  assert.equal(posted.length, 3);
  emitResponse({
    id: posted[2].id,
    ok: true,
    result: {
      pageCount: 3,
      widthPx: 2,
      heightPx: 2,
      rgba: new Uint8Array(16).fill(50),
    },
  });
  await r4;
  assert.equal(client.getStats().evictions, 1);
  assert.equal(client.getStats().cacheBytes, 32);

  // Page 0 must still be a cache hit.
  const page0Cached = await client.renderPage({
    docKey: 'doc-pdf',
    pdfBytes,
    pageIndex: 0,
    scale: 1,
  });
  assert.equal(page0Cached.fromCache, true);
  assert.equal(posted.length, 3);

  client.dispose();
  assert.equal(terminated, true);
  assert.equal(client.getStats().disposed, true);
  assert.equal(client.getStats().cacheEntries, 0);
});

void test('verifyZeroThirdPartyJs passes on repo and catches forbidden imports, scripts, and manifests', () => {
  const realReport = verifyZeroThirdPartyJs();
  assert.equal(
    realReport.ok,
    true,
    `Expected 0 violations, got: ${realReport.violations.join('; ')}`
  );
  assert.ok(realReport.checkedFiles >= 8);

  const tmp = mkdtempSync(join(tmpdir(), 'affine-zero-js-gate-'));
  try {
    const fakeWeb = join(tmp, 'web');
    mkdirSync(join(fakeWeb, 'src'), { recursive: true });
    writeFileSync(join(tmp, 'package.json'), '{"name":"bad"}');
    writeFileSync(
      join(fakeWeb, 'src/bad.js'),
      "import {\n  useState,\n} from 'react';\nexport {\n  debounce,\n} from 'lodash';\nconst s = document.createElement('script');\ns.src = 'https://evil.example/a.js';\n"
    );
    writeFileSync(
      join(fakeWeb, 'index.html'),
      '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\' https://cdn.evil.com" /></head><body><canvas id="app-canvas"></canvas><div id="floating-menu"></div></body></html>'
    );
    const badReport = verifyZeroThirdPartyJs({
      webRoot: fakeWeb,
      hostsRoot: tmp,
    });
    assert.equal(badReport.ok, false);
    assert.ok(badReport.violations.some(v => v.includes('package.json')));
    assert.ok(badReport.violations.some(v => v.includes('react')));
    assert.ok(badReport.violations.some(v => v.includes('lodash')));
    assert.ok(badReport.violations.some(v => v.includes('cdn.evil.com')));
    assert.ok(badReport.violations.some(v => v.includes('floating-menu')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

void test('gpu recovery single-flight mutex blocks late restore, deduplicates concurrent losses, pauses timer when hidden, and recreates runtime #boot retry UI', async () => {
  const tick = () => new Promise(r => setTimeout(r, 0));

  // 1. Late webglcontextrestored while fallback flush is in flight must not resume input or overwrite state.
  for (const flushOk of [true, false]) {
    let resolveFlush;
    const log = [];
    const ctrl = createGpuRecoveryController({
      getHref: () => 'https://app.affine.pro/workspace/ws-1',
      isOAuthCodeConsumed: () => false,
      pauseInput: () => log.push('pause'),
      resumeInput: () => log.push('resume'),
      freezeFrameLoop: () => log.push('freeze'),
      unfreezeFrameLoop: () => log.push('unfreeze'),
      flushPendingWrites: () =>
        new Promise(r => {
          log.push('flush-start');
          resolveFlush = () =>
            r({ ok: flushOk, pendingCount: flushOk ? 0 : 1 });
        }),
      navigate: url => log.push(`nav:${new URL(url).search}`),
      showFatal: (_msg, opts) =>
        log.push(`fatal:retry=${Boolean(opts?.retryable)}`),
      onContextRestored: () => true,
    });

    const fallbackPromise = ctrl.triggerFallback('context-restore-timeout');
    assert.equal(ctrl.getState().status, 'fallback-pending');

    const lateRestore = await ctrl.handleWebGlContextRestored();
    assert.equal(lateRestore.recovered, false);
    assert.equal(ctrl.getState().status, 'fallback-pending');
    assert.equal(ctrl.getState().inputPaused, true);
    assert.equal(log.includes('resume'), false);

    // Concurrent loss events during fallback-pending must not start extra flushes.
    ctrl.handleWebGlContextLost({ preventDefault() {} });
    ctrl.handleWebGlContextLost({ preventDefault() {} });
    resolveFlush();
    await fallbackPromise;
    await tick();

    assert.equal(log.filter(x => x === 'flush-start').length, 1);
    assert.equal(log.filter(x => x.startsWith('nav:')).length, flushOk ? 1 : 0);
    assert.equal(
      ctrl.getState().status,
      flushOk ? 'fallback-navigated' : 'fallback-blocked'
    );
  }

  // 2. Visibility hidden pauses restore timeout; visible resumes it.
  let hidden = true;
  let timerCallbacks = [];
  const visCtrl = createGpuRecoveryController({
    getHref: () => 'https://app.affine.pro/doc/1',
    isOAuthCodeConsumed: () => false,
    isDocumentHidden: () => hidden,
    pauseInput() {},
    resumeInput() {},
    flushPendingWrites: async () => ({ ok: true, pendingCount: 0 }),
    navigate() {},
    setTimer: fn => {
      timerCallbacks.push(fn);
      return timerCallbacks.length;
    },
    clearTimer() {
      timerCallbacks = [];
    },
  });
  visCtrl.handleWebGlContextLost({ preventDefault() {} });
  assert.equal(timerCallbacks.length, 0);
  hidden = false;
  visCtrl.handleVisibilityChange(false);
  assert.equal(timerCallbacks.length, 1);

  // 3. Post-boot showBootFatal recreates #boot on doc.body with clickable #gpu-fallback-retry.
  const elements = new Map();
  const makeNode = tag => {
    const node = {
      tag,
      id: '',
      dataset: {},
      style: {},
      textContent: '',
      disabled: false,
      onclick: null,
      children: [],
      setAttribute() {},
      append(child) {
        this.children.push(child);
        if (child.id) elements.set(child.id, child);
      },
      remove() {
        if (this.id) elements.delete(this.id);
        for (const c of this.children) {
          if (c.id) elements.delete(c.id);
        }
      },
    };
    return node;
  };
  const body = makeNode('body');
  const bootInit = makeNode('div');
  bootInit.id = 'boot';
  elements.set('boot', bootInit);
  const fakeDoc = {
    body,
    createElement: makeNode,
    getElementById: id => elements.get(id) || null,
    querySelectorAll: () => [],
  };

  removeBootSkeleton(/** @type {any} */ (fakeDoc));
  assert.equal(fakeDoc.getElementById('boot'), null);

  let retryClicked = 0;
  showBootFatal(
    /** @type {any} */ (fakeDoc),
    'Unable to save pending edits. Tap Retry to try again.',
    {
      retryable: true,
      onRetry: () => {
        retryClicked += 1;
      },
    }
  );
  assert.ok(fakeDoc.getElementById('boot'));
  assert.equal(
    fakeDoc.getElementById('boot-message')?.textContent,
    'Unable to save pending edits. Tap Retry to try again.'
  );
  const retryBtn = fakeDoc.getElementById('gpu-fallback-retry');
  assert.ok(retryBtn);
  retryBtn.onclick();
  assert.equal(retryClicked, 1);
  hideRuntimeFatal(/** @type {any} */ (fakeDoc));
  assert.equal(fakeDoc.getElementById('boot'), null);
});

void test('pdf client recovers from worker error by spawning a fresh worker and protects cached RGBA buffers from caller transfer', async () => {
  let spawnCount = 0;
  let respond = false;
  let currentListeners = null;
  const sentScales = [];

  const makeMockWorker = () => {
    const listeners = { message: new Set(), error: new Set() };
    currentListeners = listeners;
    return {
      postMessage(msg) {
        sentScales.push(msg.scale);
        if (!respond) return;
        queueMicrotask(() => {
          const rgba = new Uint8Array(64).fill(42);
          for (const fn of listeners.message) {
            fn({
              data: {
                id: msg.id,
                ok: true,
                result: { pageCount: 2, widthPx: 4, heightPx: 4, rgba },
              },
            });
          }
        });
      },
      addEventListener: (t, fn) => listeners[t]?.add(fn),
      removeEventListener: (t, fn) => listeners[t]?.delete(fn),
      terminate() {},
    };
  };

  const client = createPdfPreviewClient({
    workerLoader: {
      loadWorker() {
        spawnCount += 1;
        return makeMockWorker();
      },
      terminateWorker() {
        return true;
      },
    },
  });

  const pdfBytes = new Uint8Array(16);
  const failed = client.renderPage({ docKey: 'd1', pdfBytes, pageIndex: 0 });
  for (const fn of currentListeners.error) {
    fn({ message: 'worker crashed' });
  }
  await assert.rejects(failed, /worker crashed/);
  assert.equal(spawnCount, 1);

  // Next request spawns a fresh worker and succeeds; concurrent dedup returns independent buffers.
  respond = true;
  const [pA, pB] = await Promise.all([
    client.renderPage({ docKey: 'd1', pdfBytes, pageIndex: 0, scale: 8 }),
    client.renderPage({ docKey: 'd1', pdfBytes, pageIndex: 0, scale: 4 }),
  ]);
  assert.equal(spawnCount, 2);
  assert.equal(pA.scale, 4);
  assert.equal(pB.scale, 4);
  assert.equal(client.getStats().dedupHits, 1);
  assert.notEqual(pA.rgba, pB.rgba);

  // Transferring caller A's buffer must NOT empty caller B's buffer or the cached entry.
  structuredClone(pA.rgba.buffer, { transfer: [pA.rgba.buffer] });
  assert.equal(pA.rgba.byteLength, 0);
  assert.equal(pB.rgba.byteLength, 64);

  const cached = await client.renderPage({
    docKey: 'd1',
    pdfBytes,
    pageIndex: 0,
    scale: 8,
  });
  assert.equal(cached.fromCache, true);
  assert.equal(cached.scale, 4);
  assert.equal(cached.rgba.byteLength, 64);
  assert.equal(cached.rgba[0], 42);

  // Scale below 0.25 clamps to 0.25 before cache lookup and worker RPC.
  const lowScale = await client.renderPage({
    docKey: 'd1',
    pdfBytes,
    pageIndex: 1,
    scale: 0.1,
  });
  assert.equal(lowScale.scale, 0.25);
  assert.equal(sentScales.at(-1), 0.25);
  client.dispose();
});

void test('stale async restore epoch cannot overwrite fallback-pending, async Cut aborts when selection changes, and WebGPU setScene presents frames', async () => {
  // 1. Stale async onContextRestored resolving after a newer contextlost tripped fallback-pending.
  let resolveRestore;
  let resolveFlush;
  const events = [];
  const ctrl = createGpuRecoveryController({
    getHref: () => 'https://app.affine.pro/workspace/ws-1/doc-1',
    isOAuthCodeConsumed: () => false,
    pauseInput: () => events.push('pause'),
    resumeInput: () => events.push('resume'),
    freezeFrameLoop: () => events.push('freeze'),
    unfreezeFrameLoop: () => events.push('unfreeze'),
    onContextRestored: () =>
      new Promise(r => {
        resolveRestore = () => r(true);
      }),
    flushPendingWrites: () =>
      new Promise(r => {
        events.push('flush-start');
        resolveFlush = () => r({ ok: true, pendingCount: 0 });
      }),
    navigate: url => events.push(`nav:${new URL(url).search}`),
    maxContextLosses: 2,
  });

  ctrl.handleWebGlContextLost({ preventDefault() {} });
  const staleRestorePromise = ctrl.handleWebGlContextRestored();
  // Second loss arrives before async restore finishes -> trips fallback-pending.
  ctrl.handleWebGlContextLost({ preventDefault() {} });
  assert.equal(ctrl.getState().status, 'fallback-pending');

  // Stale restore now resolves true -> must NOT revert status or resume input.
  resolveRestore();
  const staleResult = await staleRestorePromise;
  assert.equal(staleResult.recovered, false);
  assert.equal(ctrl.getState().status, 'fallback-pending');
  assert.equal(ctrl.getState().inputPaused, true);
  assert.equal(events.includes('resume'), false);

  resolveFlush();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(ctrl.getState().status, 'fallback-navigated');

  // 2. Async Cut aborts deleteSelection when selection moves from "A" to "B" mid-write.
  let docText = 'AB';
  let selectedRange = 'A';
  let selectionToken = 'sel-0-1';
  let resolveWrite;
  const cutPromise = executeClipboardAction({
    action: 'cut',
    getSelectedText: () => selectedRange,
    getSelectionToken: () => selectionToken,
    deleteSelection: () => {
      docText = docText.replace(selectedRange, '');
    },
    isSecureContext: true,
    clipboard: {
      writeText: () =>
        new Promise(r => {
          resolveWrite = r;
        }),
    },
  });
  selectedRange = 'B';
  selectionToken = 'sel-1-2';
  resolveWrite();
  const cutRes = await cutPromise;
  assert.equal(cutRes.ok, false);
  assert.equal(cutRes.reason, 'selection-changed-during-cut');
  assert.equal(docText, 'AB');

  // 3. Sandwiched bare side-effect import before semicolon is caught by verifyZeroThirdPartyJs.
  const tmp = mkdtempSync(join(tmpdir(), 'affine-zero-js-semi-'));
  try {
    const fakeWeb = join(tmp, 'web');
    mkdirSync(join(fakeWeb, 'src'), { recursive: true });
    writeFileSync(
      join(fakeWeb, 'src/sandwich.js'),
      "import 'evil-polyfill';\nimport { ok } from './ok.js';\nexport const v = ok;\n"
    );
    writeFileSync(
      join(fakeWeb, 'index.html'),
      '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\' \'wasm-unsafe-eval\'" /></head><body><canvas id="app-canvas"></canvas><textarea id="ime"></textarea><div id="safe-area-probe" aria-hidden="true"></div><div id="embed-layer"></div></body></html>'
    );
    const report = verifyZeroThirdPartyJs({ webRoot: fakeWeb, hostsRoot: tmp });
    assert.equal(report.ok, false);
    assert.ok(report.violations.some(v => v.includes('evil-polyfill')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // 4. WebGPU first frame followed by setScene presents a second frame and returns true.
  let submitCount = 0;
  let copyCalls = 0;
  const webGpuCanvas = {
    id: 'app-canvas',
    width: 390,
    height: 844,
    getContext(kind) {
      if (kind === 'webgpu') {
        return {
          configure() {},
          getCurrentTexture: () => ({ createView: () => ({}) }),
        };
      }
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const fakeGpuNav = {
    gpu: {
      getPreferredCanvasFormat: () => 'bgra8unorm',
      requestAdapter: async () => ({
        requestDevice: async () => ({
          lost: new Promise(() => {}),
          createCommandEncoder: () => ({
            beginRenderPass: () => ({ end() {} }),
            finish: () => ({}),
          }),
          queue: {
            copyExternalImageToTexture: () => {
              copyCalls += 1;
            },
            submit: () => {
              submitCount += 1;
            },
          },
        }),
      }),
    },
  };
  const indexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
  const manifestJson = indexHtml
    .match(
      /<script id="affine-build-manifest" type="application\/json">([\s\S]*?)<\/script>/
    )[1]
    .trim();
  const fakeDoc = {
    createElement: tag =>
      tag === 'canvas'
        ? {
            width: 390,
            height: 844,
            getContext: kind =>
              kind === '2d'
                ? new Proxy(
                    {},
                    {
                      get: () => () => {},
                      set: () => true,
                    }
                  )
                : null,
          }
        : {},
    getElementById(id) {
      if (id === 'affine-build-manifest') return { textContent: manifestJson };
      if (id === 'app-canvas') return webGpuCanvas;
      if (id === 'ime') return { readOnly: false };
      if (id === 'boot') return { dataset: {}, remove() {} };
      return null;
    },
    querySelectorAll: () => [],
  };
  const origNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const origDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'navigator', {
    value: fakeGpuNav,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: fakeDoc,
    configurable: true,
  });
  try {
    const fakeWin = {
      navigator: fakeGpuNav,
      location: { href: 'https://app.affine.pro/', assign() {} },
    };
    const handle = await bootWebHost({
      win: fakeWin,
      doc: fakeDoc,
      importModule: async () => {
        globalThis.__AFFINE_WEB_HOST__ = fakeWin.__AFFINE_WEB_HOST__;
        try {
          await import('../src/default-app-entry.js?webgpu-scene=1');
        } finally {
          delete globalThis.__AFFINE_WEB_HOST__;
        }
      },
    });
    assert.equal(submitCount, 1);
    const presented = handle.selectionOverlay.setScene({
      paint(ctx) {
        ctx.fillRect(0, 0, 10, 10);
      },
      selection: {
        viewport: { width: 390, height: 844 },
        rects: [{ x: 20, y: 100, width: 100, height: 24 }],
        caretStart: { x: 20, y: 100, height: 24 },
        caretEnd: { x: 120, y: 100, height: 24 },
      },
    });
    assert.equal(presented, true);
    assert.equal(submitCount, 2);
    assert.ok(copyCalls >= 1);
    handle.dispose();
  } finally {
    if (origNav) Object.defineProperty(globalThis, 'navigator', origNav);
    else delete globalThis.navigator;
    if (origDoc) Object.defineProperty(globalThis, 'document', origDoc);
    else delete globalThis.document;
  }
});

void test('cut requires non-null selection token, concurrent PDF dedup survives first-caller transfer, and setScene rejects clear-only presentation', async () => {
  // 1. Duplicate-text "A·A" cut without getSelectionToken (or null token) refuses deletion.
  let dupDoc = 'A·A';
  let writeCalled = 0;
  const noTokenCut = await executeClipboardAction({
    action: 'cut',
    getSelectedText: () => 'A',
    deleteSelection: () => {
      dupDoc = 'A·';
    },
    isSecureContext: true,
    clipboard: {
      writeText: async () => {
        writeCalled += 1;
      },
    },
  });
  assert.equal(noTokenCut.ok, false);
  assert.equal(noTokenCut.reason, 'missing-selection-token');
  assert.equal(writeCalled, 0);
  assert.equal(dupDoc, 'A·A');

  // Moving selection between two identical "A" occurrences mid-write aborts deletion.
  let token = 'range:0-1';
  let resolveDupWrite;
  const movedIdenticalCut = executeClipboardAction({
    action: 'cut',
    getSelectedText: () => 'A',
    getSelectionToken: () => token,
    deleteSelection: () => {
      dupDoc = 'A·';
    },
    isSecureContext: true,
    clipboard: {
      writeText: () =>
        new Promise(r => {
          resolveDupWrite = r;
        }),
    },
  });
  token = 'range:2-3';
  resolveDupWrite();
  const movedRes = await movedIdenticalCut;
  assert.equal(movedRes.ok, false);
  assert.equal(movedRes.reason, 'selection-changed-during-cut');
  assert.equal(dupDoc, 'A·A');

  // 2. Concurrent PDF dedup: caller A transfers immediately in .then before caller B slices (cacheable & uncacheable).
  for (const maxCacheBytes of [1024, 1]) {
    let rpcCount = 0;
    /** @type {((ev: { data: any }) => void)[]} */
    const listeners = [];
    let lastMsgId = 0;
    const client = createPdfPreviewClient({
      workerLoader: {
        loadWorker: () => ({
          postMessage(msg) {
            rpcCount += 1;
            lastMsgId = msg.id;
          },
          addEventListener(type, fn) {
            if (type === 'message') listeners.push(fn);
          },
          removeEventListener() {},
          terminate() {},
        }),
      },
      maxCacheBytes,
    });
    const pdfBytes = new Uint8Array(8);
    // Caller A registers transfer .then BEFORE caller B requests the same page.
    const callerA = client
      .renderPage({ docKey: 'doc-t', pdfBytes, pageIndex: 0, scale: 1 })
      .then(res => {
        const transferred = structuredClone(res.rgba, {
          transfer: [res.rgba.buffer],
        });
        return transferred.byteLength;
      });
    const callerB = client
      .renderPage({ docKey: 'doc-t', pdfBytes, pageIndex: 0, scale: 1 })
      .then(res => res.rgba.byteLength);

    const rgba = new Uint8Array([10, 20, 30, 40]);
    for (const fn of listeners) {
      fn({
        data: {
          id: lastMsgId,
          ok: true,
          result: { pageCount: 1, widthPx: 1, heightPx: 1, rgba },
        },
      });
    }
    const [lenA, lenB] = await Promise.all([callerA, callerB]);
    assert.equal(rpcCount, 1);
    assert.equal(lenA, 4);
    assert.equal(lenB, 4);
    client.dispose();
  }

  // 3. WebGPU without copyExternalImageToTexture falls back to replacement canvas; offscreen missing 2D returns false.
  const indexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
  const manifestJson = indexHtml
    .match(
      /<script id="affine-build-manifest" type="application\/json">([\s\S]*?)<\/script>/
    )[1]
    .trim();

  for (const mode of [
    'webgpu-no-copy-draws-on-replacement',
    'offscreen-no-2d',
  ]) {
    let replacedWith = null;
    let replacementDrawImages = 0;
    let clearOnlySubmits = 0;
    const gpuCanvas = {
      id: 'app-canvas',
      width: 390,
      height: 844,
      replaceWith(next) {
        replacedWith = next;
      },
      getContext(kind) {
        if (kind === 'webgpu') {
          return {
            configure() {},
            getCurrentTexture: () => ({ createView: () => ({}) }),
          };
        }
        return null;
      },
      addEventListener() {},
      removeEventListener() {},
    };
    const fakeGpuNav = {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({
          requestDevice: async () => ({
            lost: new Promise(() => {}),
            createCommandEncoder: () => ({
              beginRenderPass: () => ({ end() {} }),
              finish: () => ({}),
            }),
            queue: {
              // Intentionally omit copyExternalImageToTexture.
              submit: () => {
                clearOnlySubmits += 1;
              },
            },
          }),
        }),
      },
    };
    const fakeDoc = {
      createElement(tag) {
        if (tag !== 'canvas') return {};
        return {
          id: '',
          width: 390,
          height: 844,
          setAttribute() {},
          addEventListener() {},
          removeEventListener() {},
          getContext(kind) {
            if (this.id === 'app-canvas') {
              if (kind === '2d') {
                return {
                  clearRect() {},
                  drawImage() {
                    replacementDrawImages += 1;
                  },
                };
              }
              return null;
            }
            if (kind === '2d') {
              if (mode === 'offscreen-no-2d') return null;
              return new Proxy({}, { get: () => () => {}, set: () => true });
            }
            return null;
          },
        };
      },
      getElementById(id) {
        if (id === 'affine-build-manifest')
          return { textContent: manifestJson };
        if (id === 'app-canvas') return gpuCanvas;
        if (id === 'ime') return { readOnly: false };
        if (id === 'boot') return { dataset: {}, remove() {} };
        return null;
      },
      querySelectorAll: () => [],
    };
    const origNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const origDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const origOffscreen = Object.getOwnPropertyDescriptor(
      globalThis,
      'OffscreenCanvas'
    );
    Object.defineProperty(globalThis, 'navigator', {
      value: fakeGpuNav,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: fakeDoc,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'OffscreenCanvas', {
      value: undefined,
      configurable: true,
    });
    try {
      const fakeWin = {
        navigator: fakeGpuNav,
        location: { href: 'https://app.affine.pro/', assign() {} },
      };
      const handle = await bootWebHost({
        win: fakeWin,
        doc: fakeDoc,
        importModule: async () => {
          globalThis.__AFFINE_WEB_HOST__ = fakeWin.__AFFINE_WEB_HOST__;
          try {
            await import(`../src/default-app-entry.js?scene-mode=${mode}`);
          } finally {
            delete globalThis.__AFFINE_WEB_HOST__;
          }
        },
      });
      assert.equal(clearOnlySubmits, 1);
      const presented = handle.selectionOverlay.setScene({
        paint(ctx) {
          ctx.fillRect(0, 0, 10, 10);
        },
        selection: {
          viewport: { width: 390, height: 844 },
          rects: [{ x: 20, y: 100, width: 100, height: 24 }],
          caretStart: { x: 20, y: 100, height: 24 },
          caretEnd: { x: 120, y: 100, height: 24 },
        },
      });
      if (mode === 'webgpu-no-copy-draws-on-replacement') {
        assert.equal(presented, true);
        assert.ok(replacedWith);
        assert.equal(replacementDrawImages, 1);
        assert.equal(clearOnlySubmits, 1);
      } else {
        assert.equal(presented, false);
        assert.equal(handle.selectionOverlay.getLayout(), null);
        assert.equal(clearOnlySubmits, 1);
      }
      handle.dispose();
    } finally {
      if (origNav) Object.defineProperty(globalThis, 'navigator', origNav);
      else delete globalThis.navigator;
      if (origDoc) Object.defineProperty(globalThis, 'document', origDoc);
      else delete globalThis.document;
      if (origOffscreen) {
        Object.defineProperty(globalThis, 'OffscreenCanvas', origOffscreen);
      } else {
        delete globalThis.OffscreenCanvas;
      }
    }
  }
});

void test('production overlay Cut rejects missing logical token and isolates scene close or replacement during async clipboard write', async () => {
  const indexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
  const manifestJson = indexHtml
    .match(
      /<script id="affine-build-manifest" type="application\/json">([\s\S]*?)<\/script>/
    )[1]
    .trim();

  const listeners = new Map();
  const appCanvas = {
    id: 'app-canvas',
    width: 390,
    height: 844,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 390,
      height: 844,
    }),
    getContext(kind) {
      if (kind === '2d') {
        return new Proxy({}, { get: () => () => {}, set: () => true });
      }
      return null;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
  };
  const fakeDoc = {
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        id: '',
        width: 390,
        height: 844,
        getContext(kind) {
          if (kind === '2d') {
            return new Proxy({}, { get: () => () => {}, set: () => true });
          }
          if (kind === 'webgl2') {
            return { getParameter: () => 'WebGL2', getExtension: () => null };
          }
          return null;
        },
      };
    },
    getElementById(id) {
      if (id === 'affine-build-manifest') return { textContent: manifestJson };
      if (id === 'app-canvas') return appCanvas;
      if (id === 'ime') return { readOnly: false };
      if (id === 'boot') return { dataset: {}, remove() {} };
      return null;
    },
    querySelectorAll: () => [],
  };
  const origDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const origOffscreen = Object.getOwnPropertyDescriptor(
    globalThis,
    'OffscreenCanvas'
  );
  Object.defineProperty(globalThis, 'document', {
    value: fakeDoc,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    value: undefined,
    configurable: true,
  });

  const dispatchPointer = (type, x, y) => {
    for (const fn of listeners.get(type) || []) {
      fn({ clientX: x, clientY: y, preventDefault() {} });
    }
  };
  const flushMicrotasks = async () => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  };

  try {
    const fakeWin = {
      navigator: { clipboard: {} },
      location: { href: 'https://app.affine.pro/', assign() {} },
    };
    const handle = await bootWebHost({
      win: fakeWin,
      doc: fakeDoc,
      importModule: async () => {
        globalThis.__AFFINE_WEB_HOST__ = fakeWin.__AFFINE_WEB_HOST__;
        try {
          await import('../src/default-app-entry.js?scene-mode=overlay-cut');
        } finally {
          delete globalThis.__AFFINE_WEB_HOST__;
        }
      },
    });

    const viewportSelection = {
      viewport: { width: 390, height: 844 },
      rects: [{ x: 24, y: 214, width: 120, height: 28 }],
      caretStart: { x: 24, y: 214, height: 28 },
      caretEnd: { x: 144, y: 214, height: 28 },
    };

    const tapCut = () => {
      const layout = handle.selectionOverlay.getLayout();
      const cutBtn = layout.menu.items.find(b => b.id === 'cut');
      assert.ok(cutBtn, 'cut button must exist in overlay layout');
      const cx = cutBtn.x + cutBtn.width / 2;
      const cy = cutBtn.y + cutBtn.height / 2;
      dispatchPointer('pointerdown', cx, cy);
      dispatchPointer('pointerup', cx, cy);
    };

    // 1a. Missing logical getSelectionToken on "A\nA" rejects Cut before clipboard write.
    let docText = 'A\nA';
    let writeCalls = 0;
    const missingTokenResults = [];
    handle.selectionOverlay.setScene({
      selection: viewportSelection,
      callbacks: {
        getSelectedText: () => docText.slice(0, 1),
        deleteSelection: () => {
          docText = docText.slice(1);
        },
        onActionResult: res => missingTokenResults.push(res),
        isSecureContext: true,
        clipboard: {
          writeText: async () => {
            writeCalls += 1;
          },
        },
      },
    });
    tapCut();
    await flushMicrotasks();
    assert.equal(missingTokenResults.length, 1);
    assert.equal(missingTokenResults[0].ok, false);
    assert.equal(missingTokenResults[0].reason, 'missing-selection-token');
    assert.equal(writeCalls, 0);
    assert.equal(docText, 'A\nA');

    // 1b. Logical range token aborts Cut when scrolled to line 2 "A" at identical viewport coordinates.
    let activeRange = { line: 1, start: 0, end: 1 };
    let resolveWrite;
    const movedResults = [];
    handle.selectionOverlay.setScene({
      selection: viewportSelection,
      callbacks: {
        getSelectedText: () =>
          docText.slice(activeRange.start, activeRange.end),
        getSelectionToken: () =>
          `line:${activeRange.line}:${activeRange.start}-${activeRange.end}`,
        deleteSelection: () => {
          docText =
            docText.slice(0, activeRange.start) +
            docText.slice(activeRange.end);
        },
        onActionResult: res => movedResults.push(res),
        isSecureContext: true,
        clipboard: {
          writeText: () =>
            new Promise(resolve => {
              resolveWrite = resolve;
            }),
        },
      },
    });
    tapCut();
    activeRange = { line: 2, start: 2, end: 3 };
    resolveWrite();
    await flushMicrotasks();
    assert.equal(movedResults.length, 1);
    assert.equal(movedResults[0].ok, false);
    assert.equal(movedResults[0].reason, 'selection-changed-during-cut');
    assert.equal(docText, 'A\nA');

    // 2a. Closing the scene with setScene({}) during async clipboard write does not throw or mutate text.
    let closeDeleted = 0;
    const closeResults = [];
    let resolveCloseWrite;
    handle.selectionOverlay.setScene({
      selection: viewportSelection,
      callbacks: {
        getSelectedText: () => 'A',
        getSelectionToken: () => 'line:1:0-1',
        deleteSelection: () => {
          closeDeleted += 1;
        },
        onActionResult: res => closeResults.push(res),
        isSecureContext: true,
        clipboard: {
          writeText: () =>
            new Promise(resolve => {
              resolveCloseWrite = resolve;
            }),
        },
      },
    });
    tapCut();
    handle.selectionOverlay.setScene({});
    resolveCloseWrite();
    await flushMicrotasks();
    assert.equal(closeDeleted, 0);
    assert.equal(closeResults.length, 0);
    assert.equal(docText, 'A\nA');

    // 2b. Replacing the scene during async clipboard write delivers 0 stale results or deletes to new callbacks.
    let oldDeleted = 0;
    let newDeleted = 0;
    const oldResults = [];
    const newResults = [];
    let resolveReplaceWrite;
    handle.selectionOverlay.setScene({
      selection: viewportSelection,
      callbacks: {
        getSelectedText: () => 'A',
        getSelectionToken: () => 'scene-old:0-1',
        deleteSelection: () => {
          oldDeleted += 1;
        },
        onActionResult: res => oldResults.push(res),
        isSecureContext: true,
        clipboard: {
          writeText: () =>
            new Promise(resolve => {
              resolveReplaceWrite = resolve;
            }),
        },
      },
    });
    tapCut();
    handle.selectionOverlay.setScene({
      selection: viewportSelection,
      callbacks: {
        getSelectedText: () => 'B',
        getSelectionToken: () => 'scene-new:0-1',
        deleteSelection: () => {
          newDeleted += 1;
        },
        onActionResult: res => newResults.push(res),
        isSecureContext: true,
        clipboard: { writeText: async () => {} },
      },
    });
    resolveReplaceWrite();
    await flushMicrotasks();
    assert.equal(oldDeleted, 0);
    assert.equal(newDeleted, 0);
    assert.equal(oldResults.length, 0);
    assert.equal(newResults.length, 0);
    assert.equal(docText, 'A\nA');

    handle.dispose();
  } finally {
    if (origDoc) Object.defineProperty(globalThis, 'document', origDoc);
    else delete globalThis.document;
    if (origOffscreen) {
      Object.defineProperty(globalThis, 'OffscreenCanvas', origOffscreen);
    } else {
      delete globalThis.OffscreenCanvas;
    }
  }
});
