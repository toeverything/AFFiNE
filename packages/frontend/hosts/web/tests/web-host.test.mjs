import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bootWebHost,
  buildLegacyFallbackUrl,
  createSafeAreaTracker,
  createSandboxedEmbedIframe,
  detectGraphicsSupport,
  flushBeforeNavigation,
  focusImeInGesture,
  isLegacyShellUrl,
  observeSafeAreaProbe,
  sanitizeEmbedSandbox,
  validateEmbedSrc,
} from '../src/host.js';
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
  const allowedTags = new Set(['canvas', 'iframe', 'script']);

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
          `script injection is only allowed in sign-in.js, found in ${file}`
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
  assert.deepEqual(res, { ok: true, status: 200 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers['content-type'], 'application/json');
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

  // After markOAuthCodeConsumed(), WebGPU device.lost strips both code and state.
  handle.markOAuthCodeConsumed();
  let resolveLost;
  const lostPromise = new Promise(r => {
    resolveLost = r;
  });
  handle.bindWebGpuDevice({ lost: lostPromise });
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
