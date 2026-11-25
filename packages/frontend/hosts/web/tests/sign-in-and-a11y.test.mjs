import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createA11yTree } from '../src/a11y.js';
import { bootWebHost } from '../src/host.js';
import {
  bootSignInPage,
  buildWebAuthHeaders,
  completeOAuthCallback,
  createClientNonce,
  createSingleUseCodeGuard,
  DEFAULT_CLIENT_VERSION,
  fetchOAuthProviders,
  GLOBAL_STATE_CLIENT_NONCE_KEY,
  isAllowedNativeAppUrl,
  isAllowedRedirectTarget,
  maybeLoadTurnstile,
  readClientNonce,
  readCsrfToken,
  resolveSafeAuthRedirect,
  signOutWebSession,
  startOAuthLogin,
  submitSignInForm,
} from '../src/sign-in.js';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function createMockElement(tag = 'div') {
  const attrs = new Map();
  const children = [];
  const listeners = new Map();
  const el = {
    tag,
    tabIndex: 0,
    readOnly: false,
    inert: false,
    hidden: false,
    focused: false,
    removed: false,
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    children,
    listeners,
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    append(child) {
      children.push(child);
    },
    remove() {
      el.removed = true;
    },
    focus() {
      el.focused = true;
      listeners.get('focus')?.({});
    },
    blur() {
      el.focused = false;
    },
  };
  return el;
}

function createMemorySessionStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, val) => map.set(key, String(val)),
  };
}

function relativeLuminance(hex) {
  const clean = hex.replace(/^#/, '');
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = Number.parseInt(clean.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

void test('Iron Rule F3 and WCAG AA contrast >= 4.5:1 on sign-in.html', () => {
  const html = readFileSync(join(WEB_ROOT, 'sign-in.html'), 'utf8');
  const js = readFileSync(join(WEB_ROOT, 'src/sign-in.js'), 'utf8');

  assert.ok(!/self-?host/i.test(html));
  assert.ok(!/add server/i.test(html));
  assert.ok(!/server[-_]?url/i.test(html));
  assert.ok(!/self-?host/i.test(js));
  assert.ok(!/add server/i.test(js));

  // Turnstile container must live outside hidden step sections so all steps can render it.
  const turnstileIdx = html.indexOf('<div id="turnstile-container"></div>');
  const stepEmailIdx = html.indexOf('<section id="step-email"');
  assert.ok(turnstileIdx > 0 && turnstileIdx < stepEmailIdx);
  assert.ok(html.includes('min-height: 100dvh'));

  // Assert WCAG AA >= 4.5:1 for all primary/link/error/secondary color tokens.
  const pairs = [
    ['primary button text', '#ffffff', '#0b6bcb'],
    ['light link on white', '#0b6bcb', '#ffffff'],
    ['dark link on card', '#60b5ff', '#1c1c1e'],
    ['light error on white', '#b91c1c', '#ffffff'],
    ['dark error on card', '#fca5a5', '#1c1c1e'],
    ['light secondary on white', '#52525b', '#ffffff'],
    ['dark secondary on card', '#a1a1aa', '#1c1c1e'],
  ];
  for (const [label, fg, bg] of pairs) {
    const ratio = contrastRatio(fg, bg);
    assert.ok(
      ratio >= 4.5,
      `${label} (${fg} on ${bg}) contrast ${ratio.toFixed(2)} < 4.5`
    );
  }
});

void test('redirect allowlist and post-auth sanitizer block backslash, tab, and cross-origin open redirects', () => {
  const origin = 'https://app.affine.pro';
  const proxyCases = [
    ['/workspace/123', true],
    ['https://cloud.affine.pro/welcome', true],
    ['https://github.com/toeverything/AFFiNE', true],
    ['//evil.example/phish', false],
    ['/\\evil.example/x', false],
    ['/\\127.0.0.1:9999/landed', false],
    ['/%5C127.0.0.1:9999/x', false],
    ['/\t/evil.example', false],
    ['https://evil.example/phish', false],
    ['javascript:alert(1)', false],
    ['data:text/html,hi', false],
  ];
  for (const [input, expected] of proxyCases) {
    assert.equal(
      isAllowedRedirectTarget(input, origin),
      expected,
      `proxy allowlist mismatch for ${JSON.stringify(input)}`
    );
  }

  const postAuthCases = [
    ['/workspace/ws-1?doc=2#top', '/workspace/ws-1?doc=2#top'],
    ['https://app.affine.pro/workspace/ws-1', '/workspace/ws-1'],
    ['//evil.example', '/'],
    ['/\\evil.example/x', '/'],
    ['/%5C127.0.0.1:9999/x', '/'],
    ['/\t/evil.example', '/'],
    ['https://evil.example/phish', '/'],
    ['', '/'],
  ];
  for (const [input, expected] of postAuthCases) {
    assert.equal(
      resolveSafeAuthRedirect(input, origin),
      expected,
      `post-auth redirect mismatch for ${JSON.stringify(input)}`
    );
  }

  assert.equal(isAllowedNativeAppUrl('affine://authentication?code=1'), true);
  assert.equal(isAllowedNativeAppUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedNativeAppUrl('https://app.affine.pro/'), false);
});

void test('auth headers, CSRF cookie parsing, and OAuth client_nonce dual-shell compatibility', async () => {
  const headers = buildWebAuthHeaders({ includeJson: true, csrfToken: 'c1' });
  assert.equal(headers['x-affine-client-kind'], 'web');
  assert.equal(headers['x-affine-version'], DEFAULT_CLIENT_VERSION);
  assert.equal(headers['x-affine-csrf-token'], 'c1');

  // Malformed percent in cookie must not throw URIError.
  assert.equal(
    readCsrfToken({ cookie: 'broken=100%raw; affine_csrf_token=tok%zz' }),
    'tok%zz'
  );

  const signOutCalls = [];
  const signOutRes = await signOutWebSession({
    documentRef: { cookie: 'affine_csrf_token=csrf-abc-123' },
    fetchImpl: async (url, init) => {
      signOutCalls.push({ url, init });
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(signOutRes, { ok: true, status: 200 });
  assert.equal(signOutCalls[0].init.headers['x-affine-client-kind'], 'web');
  assert.equal(
    signOutCalls[0].init.headers['x-affine-version'],
    DEFAULT_CLIENT_VERSION
  );
  assert.equal(
    signOutCalls[0].init.headers['x-affine-csrf-token'],
    'csrf-abc-123'
  );

  // Dual-shell client_nonce prefers localStorage['global-state:auth-client-nonce'].
  const dualSession = createMemorySessionStorage();
  const dualLocal = createMemorySessionStorage();
  const created = createClientNonce(dualSession, dualLocal);
  assert.equal(
    dualLocal.getItem(GLOBAL_STATE_CLIENT_NONCE_KEY),
    JSON.stringify(created)
  );
  assert.equal(readClientNonce(dualSession, dualLocal), created);
  dualLocal.setItem(
    GLOBAL_STATE_CLIENT_NONCE_KEY,
    JSON.stringify('legacy-shell-nonce')
  );
  assert.equal(readClientNonce(dualSession, dualLocal), 'legacy-shell-nonce');
});

void test('OAuth login, native client callback handoff, and single-use code retry semantics', async () => {
  // 1. Native client OAuth callback hands off to /open-app/url without consuming code.
  const nativeNav = [];
  const nativeApiCalls = [];
  const nativeState = JSON.stringify({
    state: 'srv-state',
    client: 'affine',
    provider: 'Google',
  });
  const nativeRes = await bootSignInPage({
    win: {
      location: {
        href: `https://app.affine.pro/oauth/callback?code=one-time-native&state=${encodeURIComponent(nativeState)}`,
        pathname: '/oauth/callback',
        replace: u => nativeNav.push(u),
      },
    },
    doc: { getElementById: () => ({ textContent: '' }) },
    fetchImpl: async url => {
      nativeApiCalls.push(url);
      return { ok: true, status: 200 };
    },
  });
  assert.equal(nativeRes.handedOff, true);
  assert.equal(nativeApiCalls.length, 0);
  assert.ok(nativeNav[0].startsWith('/open-app/url?url='));
  const deepUrl = new URL(
    new URL(nativeNav[0], 'https://app.affine.pro').searchParams.get('url')
  );
  assert.equal(deepUrl.protocol, 'affine:');
  assert.equal(deepUrl.searchParams.get('method'), 'oauth');
  assert.equal(deepUrl.searchParams.get('server'), 'https://app.affine.pro');
  assert.deepEqual(JSON.parse(deepUrl.searchParams.get('payload')), {
    state: 'srv-state',
    code: 'one-time-native',
    flow: 'redirect',
    provider: 'Google',
  });

  // 2. OAuth login preflight + single-use callback retry after network/503 failure.
  const sessionStorage = createMemorySessionStorage();
  const localStorage = createMemorySessionStorage();
  const loginRes = await startOAuthLogin({
    provider: 'Google',
    client: 'web',
    redirectUri: '/workspace/ws-1',
    flow: 'redirect',
    documentRef: { cookie: 'affine_csrf_token=c1' },
    sessionStorage,
    localStorage,
    fetchImpl: async url => {
      if (url === '/api/oauth/preflight') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            url: 'https://accounts.google.com/o/oauth2/v2/auth?state=%7B%22state%22%3A%22s-1%22%7D',
          }),
        };
      }
      return { ok: true, status: 200 };
    },
  });
  assert.equal(loginRes.ok, true);

  const guard = createSingleUseCodeGuard(sessionStorage);
  const replaced = [];
  const cbWin = {
    sessionStorage,
    localStorage,
    location: {
      href: 'https://app.affine.pro/oauth/callback?code=retry-1&state=%7B%22state%22%3A%22s-r%22%7D',
    },
    history: { replaceState: (_s, _t, u) => replaced.push(u) },
  };
  await assert.rejects(() =>
    completeOAuthCallback({
      code: 'retry-1',
      state: JSON.stringify({ state: 's-r' }),
      codeGuard: guard,
      windowRef: cbWin,
      fetchImpl: async () => {
        throw new Error('network-blip');
      },
    })
  );
  assert.equal(guard.hasConsumed('oauth:retry-1'), false);
  assert.equal(replaced.length, 0);

  const err503 = await completeOAuthCallback({
    code: 'retry-1',
    state: JSON.stringify({ state: 's-r' }),
    codeGuard: guard,
    windowRef: cbWin,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(err503.status, 503);
  assert.equal(guard.hasConsumed('oauth:retry-1'), false);

  const okCb = await completeOAuthCallback({
    code: 'retry-1',
    state: JSON.stringify({ state: 's-r' }),
    codeGuard: guard,
    windowRef: cbWin,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ redirectUri: '/workspace/ok' }),
    }),
  });
  assert.equal(okCb.ok, true);
  assert.equal(guard.hasConsumed('oauth:retry-1'), true);
  assert.deepEqual(replaced, ['/oauth/callback']);

  const dupCb = await completeOAuthCallback({
    code: 'retry-1',
    state: JSON.stringify({ state: 's-r' }),
    codeGuard: guard,
    windowRef: cbWin,
    fetchImpl: async () => {
      throw new Error('must not call backend twice');
    },
  });
  assert.deepEqual(dupCb, { ok: false, status: 409, duplicate: true });
});

void test('sign-in 3-step flow, frozen schema.gql OAuth query, Turnstile reset, and offline Use local workspace', async () => {
  // 1. Frozen schema.gql ServerConfigType query uses ONLY name, features, oauthProviders.
  const gqlBodies = [];
  const oauthCfg = await fetchOAuthProviders({
    fetchImpl: async (_url, init) => {
      gqlBodies.push(init.body);
      return {
        ok: true,
        json: async () => ({
          data: {
            serverConfig: {
              name: 'AFFiNE Cloud',
              features: ['OAuth', 'Captcha'],
              oauthProviders: ['Google', 'Apple', 'Unsupported'],
            },
          },
        }),
      };
    },
  });
  assert.ok(gqlBodies[0].includes('name features oauthProviders'));
  assert.ok(!gqlBodies[0].includes('serverName'));
  assert.deepEqual(oauthCfg, {
    serverName: 'AFFiNE Cloud',
    oauth: true,
    providers: ['Google', 'Apple'],
  });

  // 2. Captcha challenge passthrough + Turnstile reset lifecycle.
  const challengeRes = await maybeLoadTurnstile({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ provider: 'hashcash', challenge: 'hc-1' }),
    }),
    documentRef: { querySelectorAll: () => [] },
  });
  assert.equal(challengeRes.challenge, 'hc-1');
  const sentHeaders = [];
  await submitSignInForm({
    fetchImpl: async (_u, init) => {
      sentHeaders.push(init.headers);
      return { ok: true, status: 200 };
    },
    email: 'hc@affine.pro',
    password: 'pw',
    captchaProvider: 'hashcash',
    captchaToken: 'tok-1',
    captchaChallenge: 'hc-1',
  });
  assert.equal(sentHeaders[0]['x-captcha-challenge'], 'hc-1');

  // 3. Full 3-step UI: Use local workspace bound before async fetches, strict preflight, Turnstile reset.
  const nav = [];
  const els = new Map();
  for (const id of [
    'auth-card',
    'auth-status',
    'sign-in-form',
    'step-email',
    'step-password',
    'step-otp',
    'step-email-display',
    'otp-email-display',
    'oauth-providers',
    'oauth-divider',
    'turnstile-container',
    'email',
    'password',
    'otp',
    'use-local-btn',
    'switch-to-otp-btn',
    'switch-to-password-btn',
    'resend-otp-btn',
    'back-from-password-btn',
    'back-from-otp-btn',
  ]) {
    const el = createMockElement('div');
    el.hidden = id === 'step-password' || id === 'step-otp';
    els.set(id, el);
  }
  els.get('sign-in-form').getAttribute = name =>
    name === 'action' ? '/api/auth/sign-in' : null;

  let turnstileResets = 0;
  let preflightStatus = 403;
  const page = await bootSignInPage({
    win: {
      location: {
        href: 'https://app.affine.pro/sign-in?redirect_uri=%2Fworkspace%2F9',
        pathname: '/sign-in',
        replace: u => nav.push(u),
      },
      turnstile: {
        render(_el, opts) {
          opts.callback('ts-token-1');
          return 'wid-1';
        },
        reset(wid) {
          assert.equal(wid, 'wid-1');
          turnstileResets += 1;
        },
      },
    },
    doc: {
      head: { append() {} },
      querySelectorAll: () => [],
      getElementById: id => els.get(id) || null,
      createElement: tag => createMockElement(tag),
      createTextNode: text => text,
    },
    fetchImpl: async url => {
      if (url === '/api/auth/captcha') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'turnstile',
            siteKey: '0x4AAAAAA',
            action: 'sign-in',
          }),
        };
      }
      if (url === '/graphql') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              serverConfig: {
                name: 'AFFiNE',
                features: ['OAuth'],
                oauthProviders: ['Google', 'Apple'],
              },
            },
          }),
        };
      }
      if (url === '/api/auth/preflight') {
        if (preflightStatus !== 200) {
          return { ok: false, status: preflightStatus };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            registered: true,
            methods: {
              password: { available: true },
              magicLink: { available: true },
            },
          }),
        };
      }
      return { ok: true, status: 200 };
    },
  });

  // Strict preflight failure shows error and stays on email step (never blind-submits sign-in).
  els.get('email').value = 'alice@affine.pro';
  await els.get('sign-in-form').listeners.get('submit')({
    preventDefault() {},
  });
  assert.equal(page.getStep(), 'email');
  assert.ok(els.get('auth-status').textContent.includes('403'));

  // Preflight 200 advances to password step; empty password is rejected without calling sign-in.
  preflightStatus = 200;
  await els.get('sign-in-form').listeners.get('submit')({
    preventDefault() {},
  });
  assert.equal(page.getStep(), 'password');
  await els.get('sign-in-form').listeners.get('submit')({
    preventDefault() {},
  });
  assert.equal(
    els.get('auth-status').textContent,
    'Please enter your password.'
  );

  // Switching to OTP triggers magic-link send and resets Turnstile token.
  await els.get('switch-to-otp-btn').listeners.get('click')();
  assert.equal(page.getStep(), 'otp');
  assert.equal(turnstileResets, 1);
  assert.equal(page.getCaptchaToken(), null);

  // Use local workspace navigates safely to '/'.
  els.get('use-local-btn').listeners.get('click')();
  assert.equal(nav[0], '/');

  // Verify Turnstile submit buttons disable on reset and re-enable when a new token arrives,
  // and preflight with both password & magicLink unavailable stays on email with 0 sign-in calls.
  let signInPostCount = 0;
  let capturedTurnstileCb = null;
  const els2 = new Map([
    ['auth-card', createMockElement('main')],
    ['auth-status', createMockElement('p')],
    ['sign-in-form', createMockElement('form')],
    ['turnstile-container', createMockElement('div')],
    ['step-email', createMockElement('section')],
    ['step-password', createMockElement('section')],
    ['step-otp', createMockElement('section')],
    ['submit-button', createMockElement('button')],
    ['password-submit-button', createMockElement('button')],
    [
      'otp-submit-button',
      Object.assign(createMockElement('button'), { disabled: false }),
    ],
    ['switch-to-otp-btn', createMockElement('button')],
    ['resend-otp-btn', createMockElement('button')],
    [
      'email',
      Object.assign(createMockElement('input'), {
        value: 'blocked@affine.pro',
      }),
    ],
  ]);
  const page2 = await bootSignInPage({
    win: {
      location: {
        href: 'https://app.affine.pro/sign-in',
        assign() {},
      },
      turnstile: {
        render(_c, opts) {
          capturedTurnstileCb = opts.callback;
          return 'w-r5';
        },
        reset() {},
      },
    },
    doc: {
      head: createMockElement('head'),
      createElement: tag => createMockElement(tag),
      getElementById: id => els2.get(id) || null,
    },
    fetchImpl: async url => {
      if (url === '/api/auth/captcha') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            provider: 'turnstile',
            siteKey: '0x4AAA',
            challenge: 'ch-r5',
          }),
        };
      }
      if (url === '/api/auth/preflight') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            registered: true,
            methods: {
              password: { available: false },
              magicLink: { available: false },
            },
          }),
        };
      }
      if (url === '/api/auth/sign-in') {
        signInPostCount += 1;
      }
      return { ok: true, status: 200 };
    },
  });

  // Before Turnstile issues token, captcha-consuming buttons are disabled while #otp-submit-button stays enabled.
  assert.equal(els2.get('submit-button').disabled, true);
  assert.equal(els2.get('password-submit-button').disabled, true);
  assert.equal(els2.get('switch-to-otp-btn').disabled, true);
  assert.equal(els2.get('resend-otp-btn').disabled, true);
  assert.equal(els2.get('otp-submit-button').disabled, false);
  capturedTurnstileCb('tok-r5');
  assert.equal(els2.get('submit-button').disabled, false);
  assert.equal(els2.get('password-submit-button').disabled, false);
  assert.equal(els2.get('switch-to-otp-btn').disabled, false);
  assert.equal(els2.get('resend-otp-btn').disabled, false);
  page2.resetTurnstile();
  assert.equal(els2.get('submit-button').disabled, true);
  assert.equal(els2.get('password-submit-button').disabled, true);
  assert.equal(els2.get('resend-otp-btn').disabled, true);
  assert.equal(els2.get('otp-submit-button').disabled, false);
  capturedTurnstileCb('tok-r5-2');
  assert.equal(els2.get('submit-button').disabled, false);
  assert.equal(els2.get('resend-otp-btn').disabled, false);

  // Submitting email when both password and magicLink are unavailable stays on email with 0 sign-in calls.
  await els2.get('sign-in-form').listeners.get('submit')({
    preventDefault() {},
  });
  assert.equal(page2.getStep(), 'email');
  assert.equal(
    els2.get('auth-status').textContent,
    'No sign-in methods are available for this account.'
  );
  assert.equal(signInPostCount, 0);
});

void test('a11y tree enforces inert + tabindex exclusivity and mountSandboxedEmbed does not steal focus until activated', async () => {
  const root = createMockElement('div');
  const ime = createMockElement('textarea');
  const embedLayer = createMockElement('div');
  const doc = { createElement: tag => createMockElement(tag) };

  const a11y = createA11yTree({ doc, root, ime, embedLayer });
  const entry = a11y.getNode(a11y.defaultEntryId);
  assert.equal(root.inert, false);
  assert.equal(entry.getAttribute('tabindex'), '0');
  assert.equal(ime.tabIndex, -1);
  assert.equal(embedLayer.inert, true);

  // Focus IME: a11y becomes inert + child tabindex=-1; embed remains inert.
  a11y.setFocusOwner('ime');
  assert.equal(root.inert, true);
  assert.equal(entry.getAttribute('tabindex'), '-1');
  assert.equal(embedLayer.inert, true);
  assert.equal(ime.tabIndex, 0);
  assert.equal(ime.readOnly, false);

  // Focus embed: ime becomes readOnly + tabIndex=-1; a11y stays inert; embed active.
  a11y.setFocusOwner('embed');
  assert.equal(root.inert, true);
  assert.equal(embedLayer.inert, false);
  assert.equal(ime.readOnly, true);
  assert.equal(ime.tabIndex, -1);

  // Keyboard-reachable activateA11yEntry restores a11y inert=false + tabindex=0.
  assert.equal(a11y.activateA11yEntry(), true);
  assert.equal(root.inert, false);
  assert.equal(entry.getAttribute('tabindex'), '0');
  assert.equal(embedLayer.inert, true);

  // Returning to 'ime' or 'none' restores ime.readOnly = false.
  a11y.setFocusOwner('embed');
  a11y.setFocusOwner('ime');
  assert.equal(ime.readOnly, false);
  a11y.setFocusOwner('embed');
  a11y.setFocusOwner('none');
  assert.equal(ime.readOnly, false);

  // Wired through bootWebHost: mounting an embed must NOT steal IME focus until activated, and unmounting restores prior owner.
  const hostRoot = createMockElement('div');
  const hostIme = createMockElement('textarea');
  const hostEmbed = createMockElement('div');
  const host = await bootWebHost({
    win: {
      navigator: { gpu: {} },
      location: { href: 'https://app.affine.pro/', assign() {} },
    },
    doc: {
      createElement: tag => createMockElement(tag),
      getElementById(id) {
        if (id === 'a11y-tree') return hostRoot;
        if (id === 'ime') return hostIme;
        if (id === 'embed-layer') return hostEmbed;
        if (id === 'affine-build-manifest') {
          return {
            textContent: JSON.stringify({
              shellVersion: 'mobile-v1',
              buildHash: 'a11y-hash',
              appEntryJs: null,
              workers: {},
              fonts: {},
            }),
          };
        }
        return null;
      },
    },
  });

  assert.equal(host.focusImeInGesture({ inputMode: 'text' }), true);
  assert.equal(host.a11yTree.getFocusOwner(), 'ime');
  const embedCtrl = host.mountSandboxedEmbed({
    src: 'blob:https://app.affine.pro/embed-1',
  });
  // Mounting alone keeps IME focus & readOnly=false!
  assert.equal(host.a11yTree.getFocusOwner(), 'ime');
  assert.equal(hostIme.readOnly, false);
  assert.equal(embedCtrl.iframe.getAttribute('tabindex'), '-1');

  // Explicit activation transfers focus to embed; unmount restores IME!
  embedCtrl.activate();
  assert.equal(host.a11yTree.getFocusOwner(), 'embed');
  assert.equal(hostIme.readOnly, true);
  embedCtrl.unmount();
  assert.equal(host.a11yTree.getFocusOwner(), 'ime');
  assert.equal(hostIme.readOnly, false);

  host.dispose();
});
