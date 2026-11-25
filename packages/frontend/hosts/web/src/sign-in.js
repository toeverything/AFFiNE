// @ts-check

export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
export const WEB_CLIENT_KIND = 'web';
export const DEFAULT_CLIENT_VERSION = '0.27.5';
export const CSRF_COOKIE_NAME = 'affine_csrf_token';
export const GLOBAL_STATE_CLIENT_NONCE_KEY = 'global-state:auth-client-nonce';
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
const INVALID_OTP_MESSAGE = 'Invalid verification code';

/**
 * Returns whether the given hostname belongs to the official AFFiNE cloud shell,
 * used as fallback when GraphQL `serverConfig.type` is unavailable.
 *
 * @param {string | null | undefined} hostname
 * @returns {boolean}
 */
export function isOfficialCloudHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '');
  return (
    host === 'affine.pro' ||
    host.endsWith('.affine.pro') ||
    host === 'affine.fail' ||
    host.endsWith('.affine.fail')
  );
}

const NATIVE_CLIENT_SCHEMES = new Set([
  'affine',
  'affine-canary',
  'affine-beta',
  'affine-dev',
]);
const OAUTH_PROVIDERS = new Set(['Google', 'GitHub', 'Apple', 'OIDC']);
const TRUSTED_REDIRECT_DOMAINS = [
  'google.com',
  'stripe.com',
  'github.com',
  'twitter.com',
  'discord.gg',
  'youtube.com',
  't.me',
  'reddit.com',
  'affine.pro',
];
const CONSUMED_CODES_STORAGE_KEY = 'affine_consumed_auth_codes';
const CLIENT_NONCE_STORAGE_KEY = 'affine_auth_client_nonce';

const OAUTH_PROVIDER_ICONS = Object.freeze({
  Google:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87Z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3a7.17 7.17 0 0 1-10.67-3.77H1.39v3.09A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.38 14.32a7.2 7.2 0 0 1 0-4.64V6.59H1.39a12 12 0 0 0 0 10.82l3.99-3.09Z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.39 6.59l3.99 3.09c.95-2.85 3.6-4.93 6.62-4.93Z"/></svg>',
  Apple:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16.37 12.64c-.02-2.16 1.77-3.2 1.85-3.25-1.01-1.48-2.58-1.68-3.13-1.7-1.33-.14-2.61.79-3.29.79-.68 0-1.73-.77-2.84-.75-1.46.02-2.81.85-3.56 2.16-1.52 2.64-.39 6.55 1.09 8.69.72 1.05 1.59 2.23 2.72 2.18 1.09-.04 1.5-.71 2.82-.71 1.32 0 1.69.71 2.84.69 1.18-.02 1.92-1.07 2.64-2.12.83-1.22 1.18-2.4 1.2-2.46-.03-.01-2.31-.89-2.34-3.52ZM14.22 6.2c.6-.73 1.01-1.74.9-2.75-.87.04-1.92.58-2.54 1.3-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21Z"/></svg>',
  GitHub:
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.02c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>',
  OIDC: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
});

/**
 * Classifies standalone authentication routes served by `sign-in.html`.
 *
 * @param {string} pathname
 * @returns {'sign-in' | 'magic-link' | 'oauth' | 'redirect-proxy' | 'open-app' | 'unknown'}
 */
export function classifyAuthRoute(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/sign-in' || path === '/sign-in.html') {
    return 'sign-in';
  }
  if (path === '/magic-link') {
    return 'magic-link';
  }
  if (path === '/oauth' || path.startsWith('/oauth/')) {
    return 'oauth';
  }
  if (path === '/redirect-proxy') {
    return 'redirect-proxy';
  }
  if (path === '/open-app' || path.startsWith('/open-app/')) {
    return 'open-app';
  }
  return 'unknown';
}

/**
 * Reads a named cookie value from `document.cookie`.
 *
 * @param {string} name
 * @param {{ cookie?: string } | null | undefined} [doc]
 * @returns {string | null}
 */
export function readCookieValue(name, doc = globalThis.document) {
  const raw = doc && typeof doc.cookie === 'string' ? doc.cookie : '';
  if (!raw) {
    return null;
  }
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    const key = eq === -1 ? trimmed : trimmed.slice(0, eq);
    if (key === name) {
      if (eq === -1) {
        return '';
      }
      const rawVal = trimmed.slice(eq + 1);
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return null;
}

/**
 * Reads the same-origin `affine_csrf_token` cookie for session-mutating calls.
 *
 * @param {{ cookie?: string } | null | undefined} [doc]
 * @returns {string | null}
 */
export function readCsrfToken(doc = globalThis.document) {
  const token = readCookieValue(CSRF_COOKIE_NAME, doc);
  return token && token.trim() ? token.trim() : null;
}

/**
 * Reads the client version from `<meta name="affine-version">` if present,
 * falling back to `DEFAULT_CLIENT_VERSION`.
 *
 * @param {Document | null | undefined} [doc]
 * @returns {string}
 */
function resolveClientVersion(doc = globalThis.document) {
  if (doc && typeof doc.querySelector === 'function') {
    const meta = doc.querySelector('meta[name="affine-version"]');
    const content = meta?.getAttribute?.('content');
    if (content && content.trim()) {
      return content.trim();
    }
  }
  return DEFAULT_CLIENT_VERSION;
}

/**
 * Builds canonical same-origin Web auth headers. Every request carries
 * `x-affine-client-kind: web` and `x-affine-version`.
 *
 * @param {Object} [options]
 * @param {boolean} [options.includeJson=false]
 * @param {string | null} [options.csrfToken]
 * @param {string | null} [options.captchaProvider]
 * @param {string | null} [options.captchaToken]
 * @param {string | null} [options.captchaChallenge]
 * @param {string} [options.clientVersion]
 * @returns {Record<string, string>}
 */
export function buildWebAuthHeaders(options = {}) {
  /** @type {Record<string, string>} */
  const headers = {
    accept: 'application/json',
    'x-affine-client-kind': WEB_CLIENT_KIND,
    'x-affine-version': options.clientVersion || DEFAULT_CLIENT_VERSION,
  };
  if (options.includeJson) {
    headers['content-type'] = 'application/json';
  }
  if (options.csrfToken) {
    headers['x-affine-csrf-token'] = options.csrfToken;
  }
  if (options.captchaToken) {
    headers['x-captcha-provider'] = options.captchaProvider || 'turnstile';
    headers['x-captcha-token'] = options.captchaToken;
    if (options.captchaChallenge) {
      headers['x-captcha-challenge'] = options.captchaChallenge;
    }
  }
  return headers;
}

/**
 * Checks whether a string contains any ASCII control character (U+0000..U+001F or U+007F).
 *
 * @param {string} str
 * @returns {boolean}
 */
function hasControlChar(str) {
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Rejects backslashes, ASCII control characters (including tabs/CR/LF), and
 * percent-encoded leading backslashes (`/%5c`) that browsers normalize into
 * protocol-relative cross-origin URLs.
 *
 * @param {string} raw
 * @returns {boolean}
 */
function hasUnsafeRedirectChars(raw) {
  if (raw.includes('\\') || hasControlChar(raw)) {
    return true;
  }
  if (/^\/%5c/i.test(raw) || raw.startsWith('//')) {
    return true;
  }
  return false;
}

/**
 * Checks whether a `/redirect-proxy` target is allowed on Web: safe
 * same-origin paths/URLs or trusted allowlisted domains matching 0.27.5
 * `packages/common/infra/src/utils/redirect-allowlist.ts`.
 *
 * @param {string | null | undefined} rawTarget
 * @param {string} currentOrigin
 * @returns {boolean}
 */
export function isAllowedRedirectTarget(rawTarget, currentOrigin) {
  if (!rawTarget || typeof rawTarget !== 'string') {
    return false;
  }
  const trimmed = rawTarget.trim();
  if (!trimmed || hasUnsafeRedirectChars(trimmed)) {
    return false;
  }
  let parsed;
  let originUrl;
  try {
    originUrl = new URL(currentOrigin);
    parsed = new URL(trimmed, originUrl.origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }
  if (parsed.origin === originUrl.origin) {
    return true;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const currentHost = originUrl.hostname.toLowerCase().replace(/\.$/, '');
  if (host === currentHost) {
    return true;
  }
  if (parsed.protocol !== 'https:') {
    return false;
  }
  return TRUSTED_REDIRECT_DOMAINS.some(
    domain => host === domain || host.endsWith(`.${domain}`)
  );
}

/**
 * Resolves a safe same-origin post-authentication redirect URL, returning a
 * normalized relative path (`pathname + search + hash`) or `'/'`.
 *
 * @param {string | null | undefined} redirectUri
 * @param {string} currentOrigin
 * @returns {string}
 */
export function resolveSafeAuthRedirect(redirectUri, currentOrigin) {
  if (!redirectUri || typeof redirectUri !== 'string') {
    return '/';
  }
  const trimmed = redirectUri.trim();
  if (!trimmed || hasUnsafeRedirectChars(trimmed)) {
    return '/';
  }
  try {
    const originUrl = new URL(currentOrigin);
    const resolved = new URL(trimmed, originUrl.origin);
    if (resolved.origin !== originUrl.origin) {
      return '/';
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/';
  }
}

/**
 * Validates that a `/open-app/url` target uses an allowed AFFiNE desktop or
 * mobile custom URL scheme.
 *
 * @param {string | null | undefined} rawUrl
 * @returns {boolean}
 */
export function isAllowedNativeAppUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  return NATIVE_CLIENT_SCHEMES.has(scheme);
}

/**
 * Tracks single-use authorization codes (OAuth `code`, Magic Link `token`,
 * Open-App `code`) with separate `inFlight` (in-memory concurrency lock) and
 * `consumed` (persisted in `sessionStorage`) sets so transient network errors
 * or 5xx responses release the lock for retry while 2xx/4xx outcomes persist
 * single-use consumption.
 *
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} [storage]
 */
export function createSingleUseCodeGuard(storage = globalThis.sessionStorage) {
  /** @type {Set<string>} */
  const consumed = new Set();
  /** @type {Set<string>} */
  const inFlight = new Set();

  if (storage && typeof storage.getItem === 'function') {
    try {
      const saved = JSON.parse(
        storage.getItem(CONSUMED_CODES_STORAGE_KEY) || '[]'
      );
      if (Array.isArray(saved)) {
        for (const item of saved) {
          if (typeof item === 'string') {
            consumed.add(item);
          }
        }
      }
    } catch {
      // Ignore corrupt sessionStorage entries.
    }
  }

  /**
   * Acquires an in-flight lock for a single-use code without marking it
   * permanently consumed yet. Returns `false` if already consumed or in flight.
   *
   * @param {string} code
   * @returns {boolean}
   */
  function acquire(code) {
    const key = String(code || '').trim();
    if (!key || consumed.has(key) || inFlight.has(key)) {
      return false;
    }
    inFlight.add(key);
    return true;
  }

  /**
   * Releases an in-flight lock without marking the code consumed (used on
   * network failures or 5xx responses so the caller can safely retry).
   *
   * @param {string} code
   */
  function release(code) {
    const key = String(code || '').trim();
    if (key) {
      inFlight.delete(key);
    }
  }

  /**
   * Persists a code as permanently consumed (used after a deterministic
   * `< 500` server response).
   *
   * @param {string} code
   */
  function commit(code) {
    const key = String(code || '').trim();
    if (!key) {
      return;
    }
    inFlight.delete(key);
    consumed.add(key);
    if (storage && typeof storage.setItem === 'function') {
      try {
        storage.setItem(
          CONSUMED_CODES_STORAGE_KEY,
          JSON.stringify([...consumed])
        );
      } catch {
        // Ignore storage quota errors; in-memory set still guards this tab.
      }
    }
  }

  /**
   * Attempts to claim and immediately commit a single-use code.
   *
   * @param {string} code
   * @returns {boolean}
   */
  function tryConsume(code) {
    if (!acquire(code)) {
      return false;
    }
    commit(code);
    return true;
  }

  return {
    acquire,
    release,
    commit,
    tryConsume,
    isInFlight: code => inFlight.has(String(code || '').trim()),
    hasConsumed: code => consumed.has(String(code || '').trim()),
  };
}

/**
 * Strips single-use query parameters (`code`, `state`, `token`) from the
 * browser address bar via `history.replaceState` once consumed.
 *
 * @param {Window | null | undefined} win
 */
export function stripAuthParamsFromUrl(win) {
  if (
    !win ||
    !win.location ||
    !win.history ||
    typeof win.history.replaceState !== 'function'
  ) {
    return;
  }
  try {
    const url = new URL(win.location.href);
    let changed = false;
    for (const key of ['code', 'state', 'token']) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      win.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch {
    // Ignore invalid test URLs.
  }
}

/**
 * Generates and persists a per-session OAuth `client_nonce` into both
 * `localStorage['global-state:auth-client-nonce']` (JSON-encoded for 0.27.5
 * `LocalStorageGlobalState` dual-shell compatibility) and
 * `sessionStorage['affine_auth_client_nonce']`.
 *
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} [sessionStore]
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null | undefined} [localStore]
 * @returns {string}
 */
export function createClientNonce(
  sessionStore = globalThis.sessionStorage,
  localStore = globalThis.localStorage
) {
  const bytes = new Uint8Array(16);
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = (Date.now() + i * 31) & 0xff;
    }
  }
  const nonce = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(
    ''
  );
  if (localStore && typeof localStore.setItem === 'function') {
    try {
      localStore.setItem(GLOBAL_STATE_CLIENT_NONCE_KEY, JSON.stringify(nonce));
    } catch {
      // Ignore storage errors.
    }
  }
  if (sessionStore && typeof sessionStore.setItem === 'function') {
    try {
      sessionStore.setItem(CLIENT_NONCE_STORAGE_KEY, nonce);
    } catch {
      // Ignore storage errors.
    }
  }
  return nonce;
}

/**
 * Reads the previously stored OAuth `client_nonce`, preferring the 0.27.5
 * `localStorage['global-state:auth-client-nonce']` key (JSON-encoded string)
 * and falling back to `sessionStorage['affine_auth_client_nonce']`.
 *
 * @param {Pick<Storage, 'getItem'> | null | undefined} [sessionStore]
 * @param {Pick<Storage, 'getItem'> | null | undefined} [localStore]
 * @returns {string | undefined}
 */
export function readClientNonce(
  sessionStore = globalThis.sessionStorage,
  localStore = globalThis.localStorage
) {
  if (localStore && typeof localStore.getItem === 'function') {
    try {
      const raw = localStore.getItem(GLOBAL_STATE_CLIENT_NONCE_KEY);
      if (raw && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'string' && parsed.trim()) {
            return parsed.trim();
          }
        } catch {
          return raw.trim();
        }
      }
    } catch {
      // Fall through to sessionStorage.
    }
  }
  if (!sessionStore || typeof sessionStore.getItem !== 'function') {
    return undefined;
  }
  try {
    const val = sessionStore.getItem(CLIENT_NONCE_STORAGE_KEY);
    return val && val.trim() ? val.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Queries same-origin `/graphql` using the frozen 0.27.5 `ServerConfigType`
 * fields (`name`, `features`, `oauthProviders`). Degrades silently to an empty
 * provider list when offline or unavailable.
 *
 * @param {{ fetchImpl?: typeof fetch, clientVersion?: string }} [options]
 * @returns {Promise<{ serverName: string, oauth: boolean, providers: string[] }>}
 */
export async function fetchOAuthProviders(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  try {
    const response = await fetchImpl('/graphql', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildWebAuthHeaders({
        includeJson: true,
        clientVersion: options.clientVersion,
      }),
      body: JSON.stringify({
        query: 'query { serverConfig { name features oauthProviders type } }',
      }),
    });
    if (!response.ok) {
      return { serverName: 'AFFiNE', oauth: false, providers: [] };
    }
    const payload = await response.json();
    const cfg = payload?.data?.serverConfig;
    const rawProviders = Array.isArray(cfg?.oauthProviders)
      ? cfg.oauthProviders
      : [];
    const providers = rawProviders
      .map(p => String(p))
      .filter(p => OAUTH_PROVIDERS.has(p));
    const features = Array.isArray(cfg?.features)
      ? cfg.features.map(f => String(f))
      : null;
    const oauthEnabled =
      providers.length > 0 && (features === null || features.includes('OAuth'));
    const deploymentType =
      typeof cfg?.type === 'string' && cfg.type.trim() ? cfg.type.trim() : null;
    return {
      serverName:
        typeof cfg?.name === 'string' && cfg.name.trim()
          ? cfg.name.trim()
          : 'AFFiNE',
      oauth: oauthEnabled,
      providers: oauthEnabled ? providers : [],
      ...(deploymentType ? { deploymentType } : {}),
    };
  } catch {
    return { serverName: 'AFFiNE', oauth: false, providers: [] };
  }
}

/**
 * Renders dynamic OAuth provider buttons inside `#oauth-providers`.
 *
 * @param {Object} options
 * @param {Document} options.doc
 * @param {HTMLElement | null} options.container
 * @param {HTMLElement | null} [options.divider]
 * @param {string[]} options.providers
 * @param {string | null} [options.redirectUri]
 * @param {(url: string) => void} options.onNavigate
 */
export function renderOAuthProviders(options) {
  const { doc, container, divider, providers, redirectUri, onNavigate } =
    options;
  if (!container) {
    return;
  }
  const valid = (providers || []).filter(p => OAUTH_PROVIDERS.has(p));
  if (!valid.length) {
    container.hidden = true;
    if (divider) {
      divider.hidden = true;
    }
    return;
  }
  if ('textContent' in container) {
    container.textContent = '';
  }
  for (const provider of valid) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'oauth-btn';
    btn.dataset.provider = provider;
    const iconMarkup =
      OAUTH_PROVIDER_ICONS[
        /** @type {keyof typeof OAUTH_PROVIDER_ICONS} */ (provider)
      ] || '';
    if (iconMarkup && typeof doc.createTextNode === 'function') {
      btn.innerHTML = iconMarkup;
      btn.append(doc.createTextNode(`Continue with ${provider}`));
    } else {
      btn.textContent = `Continue with ${provider}`;
    }
    btn.addEventListener?.('click', () => {
      const params = new URLSearchParams({
        provider,
        flow: 'redirect',
      });
      if (redirectUri) {
        params.set('redirect_uri', redirectUri);
      }
      onNavigate(`/oauth/login?${params.toString()}`);
    });
    container.append(btn);
  }
  container.hidden = false;
  if (divider) {
    divider.hidden = false;
  }
}

/**
 * Queries `/api/auth/captcha` (matching the server contract
 * `{ provider: 'turnstile', siteKey, action }`) and injects the Cloudflare
 * Turnstile script only when a non-empty `siteKey` is returned.
 *
 * @param {Object} options
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Document} options.documentRef
 * @param {Window} [options.windowRef]
 * @param {HTMLElement | null} [options.container]
 * @param {string} [options.captchaEndpoint='/api/auth/captcha']
 * @param {string} [options.scriptUrl]
 * @param {(token: string) => void} [options.onToken]
 * @returns {Promise<{ loaded: boolean, provider: string | null, siteKey: string | null, action: string | null }>}
 */
export async function maybeLoadTurnstile(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const endpoint = options.captchaEndpoint || '/api/auth/captcha';
  const scriptUrl = options.scriptUrl || TURNSTILE_SCRIPT_URL;
  const winRef = options.windowRef || globalThis.window;

  const response = await fetchImpl(endpoint, {
    method: 'GET',
    credentials: 'same-origin',
    headers: buildWebAuthHeaders(),
  });
  if (!response.ok) {
    return { loaded: false, provider: null, siteKey: null, action: null };
  }

  /** @type {{ provider?: string, siteKey?: string, action?: string, challenge?: string } | null} */
  const payload = await response.json();
  const provider = payload?.provider ? String(payload.provider) : 'turnstile';
  const siteKey =
    payload && typeof payload.siteKey === 'string' && payload.siteKey.trim()
      ? payload.siteKey.trim()
      : null;
  const action =
    payload && typeof payload.action === 'string' && payload.action.trim()
      ? payload.action.trim()
      : null;
  const challenge =
    payload && typeof payload.challenge === 'string' && payload.challenge.trim()
      ? payload.challenge.trim()
      : null;

  if (!siteKey || provider.toLowerCase() !== 'turnstile') {
    return {
      loaded: false,
      provider: challenge ? provider.toLowerCase() : null,
      siteKey: null,
      action: null,
      ...(challenge ? { challenge } : {}),
    };
  }

  const doc = options.documentRef;
  if (options.container) {
    options.container.dataset.sitekey = siteKey;
    if (action) {
      options.container.dataset.action = action;
    }
  }

  const scripts =
    typeof doc.querySelectorAll === 'function'
      ? Array.from(doc.querySelectorAll('script'))
      : [];
  let scriptEl =
    scripts.find(
      node =>
        node.src === scriptUrl ||
        (typeof node.getAttribute === 'function' &&
          node.getAttribute('src') === scriptUrl)
    ) || null;
  if (!scriptEl) {
    scriptEl = doc.createElement('script');
    scriptEl.src = scriptUrl;
    scriptEl.async = true;
    scriptEl.defer = true;
    (doc.head || doc.body).append(scriptEl);
  }

  let rendered = false;
  /** @type {string | number | undefined} */
  let widgetId;
  function renderWidget() {
    if (rendered || !options.container) {
      return;
    }
    const turnstileApi =
      /** @type {{ turnstile?: { render?: Function, reset?: Function } }} */ (
        /** @type {unknown} */ (winRef || globalThis)
      ).turnstile;
    if (turnstileApi && typeof turnstileApi.render === 'function') {
      rendered = true;
      widgetId = turnstileApi.render(options.container, {
        sitekey: siteKey,
        ...(action ? { action } : {}),
        callback: token => {
          if (typeof token === 'string' && options.onToken) {
            options.onToken(token);
          }
        },
        'expired-callback': () => {
          options.onToken?.(null);
        },
        'error-callback': () => {
          options.onToken?.(null);
        },
      });
      if (typeof options.onResetReady === 'function') {
        options.onResetReady(() => {
          options.onToken?.(null);
          if (typeof turnstileApi.reset === 'function') {
            if (widgetId !== undefined) {
              turnstileApi.reset(widgetId);
            } else {
              turnstileApi.reset();
            }
          }
        });
      }
    }
  }

  renderWidget();
  if (
    !rendered &&
    scriptEl &&
    typeof scriptEl.addEventListener === 'function'
  ) {
    scriptEl.addEventListener('load', renderWidget, { once: true });
  }

  return {
    loaded: true,
    provider: 'turnstile',
    siteKey,
    action,
    ...(challenge ? { challenge } : {}),
  };
}

/**
 * Submits email/password, magic-link request, or magic-link OTP credentials as
 * `application/json`, always sending `credentials: 'same-origin'` and
 * `x-affine-client-kind: web`, plus captcha headers whenever present.
 *
 * @param {Object} options
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.endpoint='/api/auth/sign-in']
 * @param {string} options.email
 * @param {string} [options.password]
 * @param {string} [options.otp]
 * @param {string} [options.callbackUrl]
 * @param {string | null} [options.captchaProvider]
 * @param {string | null} [options.captchaToken]
 * @param {string | null} [options.captchaChallenge]
 * @returns {Promise<{ ok: boolean, status: number, method: 'password' | 'magic-link-otp' | 'magic-link-send' }>}
 */
export async function submitSignInForm(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const email = String(options.email || '').trim();
  const password = options.password ? String(options.password) : '';
  const otp = options.otp ? String(options.otp).trim() : '';

  if (otp && !password) {
    /** @type {Record<string, string>} */
    const otpBody = { email, token: otp };
    if (options.clientNonce) {
      otpBody.client_nonce = options.clientNonce;
    }
    const response = await fetchImpl('/api/auth/magic-link', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildWebAuthHeaders({
        includeJson: true,
        clientVersion: options.clientVersion,
      }),
      body: JSON.stringify(otpBody),
    });
    return {
      ok: Boolean(response.ok),
      status: response.status,
      method: 'magic-link-otp',
    };
  }

  const endpoint = options.endpoint || '/api/auth/sign-in';
  /** @type {Record<string, string>} */
  const body = { email };
  /** @type {'password' | 'magic-link-send'} */
  let method = 'magic-link-send';
  if (password) {
    body.password = password;
    method = 'password';
  } else {
    body.callbackUrl = options.callbackUrl || '/magic-link';
    if (options.clientNonce) {
      body.client_nonce = options.clientNonce;
    }
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: buildWebAuthHeaders({
      includeJson: true,
      captchaProvider: options.captchaProvider,
      captchaToken: options.captchaToken,
      captchaChallenge: options.captchaChallenge,
      clientVersion: options.clientVersion,
    }),
    body: JSON.stringify(body),
  });
  return { ok: Boolean(response.ok), status: response.status, method };
}

/**
 * Signs out the current same-origin Web cookie session using the
 * `affine_csrf_token` double-submit CSRF header.
 *
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {{ cookie?: string }} [options.documentRef]
 * @param {string | null} [options.csrfToken]
 * @returns {Promise<{ ok: boolean, status: number }>}
 */
export async function signOutWebSession(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const csrfToken =
    options.csrfToken ??
    readCsrfToken(options.documentRef || globalThis.document);
  const response = await fetchImpl('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'same-origin',
    headers: buildWebAuthHeaders({ csrfToken }),
  });
  return { ok: Boolean(response.ok), status: response.status };
}

/**
 * Starts a same-origin Web OAuth login flow via `/api/oauth/preflight`.
 *
 * @param {Object} options
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} options.provider
 * @param {string} [options.client='web']
 * @param {string | null} [options.redirectUri]
 * @param {'redirect' | 'popup'} [options.flow='redirect']
 * @param {{ cookie?: string }} [options.documentRef]
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [options.sessionStorage]
 * @returns {Promise<{ ok: boolean, status: number, url?: string, clientNonce?: string }>}
 */
export async function startOAuthLogin(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const provider = String(options.provider || '');
  const client = options.client || WEB_CLIENT_KIND;
  if (!OAUTH_PROVIDERS.has(provider)) {
    return { ok: false, status: 400 };
  }
  if (client === WEB_CLIENT_KIND) {
    await signOutWebSession({
      fetchImpl,
      documentRef: options.documentRef,
    });
  }
  const clientNonce = createClientNonce(
    options.sessionStorage,
    options.localStorage
  );
  const response = await fetchImpl('/api/oauth/preflight', {
    method: 'POST',
    credentials: 'same-origin',
    headers: buildWebAuthHeaders({ includeJson: true }),
    body: JSON.stringify({
      provider,
      client,
      ...(options.redirectUri ? { redirect_uri: options.redirectUri } : {}),
      client_nonce: clientNonce,
    }),
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const data = await response.json();
  let url = typeof data?.url === 'string' ? data.url : '';
  if (url && options.flow) {
    try {
      const parsed = new URL(url);
      const rawState = parsed.searchParams.get('state');
      if (rawState) {
        const stateObj = JSON.parse(rawState);
        parsed.searchParams.set(
          'state',
          JSON.stringify({ ...stateObj, flow: options.flow })
        );
        url = parsed.toString();
      }
    } catch {
      // Keep original URL if state is not JSON.
    }
  }
  return { ok: true, status: response.status, url, clientNonce };
}

/**
 * Completes an OAuth callback via `POST /api/oauth/callback` while guarding
 * single-use `code` against duplicate consumption.
 *
 * @param {Object} options
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} options.code
 * @param {string} options.state
 * @param {string} [options.clientNonce]
 * @param {ReturnType<typeof createSingleUseCodeGuard>} [options.codeGuard]
 * @param {Window | null} [options.windowRef]
 * @returns {Promise<{ ok: boolean, status: number, duplicate?: boolean, redirectUri?: string, flow?: 'popup' | 'redirect' }>}
 */
export async function completeOAuthCallback(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const code = String(options.code || '').trim();
  const rawState = String(options.state || '').trim();
  if (!code || !rawState) {
    return { ok: false, status: 400 };
  }

  const guard =
    options.codeGuard ||
    createSingleUseCodeGuard(options.windowRef?.sessionStorage);
  const guardKey = `oauth:${code}`;
  if (!guard.acquire(guardKey)) {
    return { ok: false, status: 409, duplicate: true };
  }

  let innerState = rawState;
  /** @type {'popup' | 'redirect'} */
  let flow = 'redirect';
  try {
    const parsed = JSON.parse(rawState);
    if (parsed && typeof parsed.state === 'string') {
      innerState = parsed.state;
    }
    if (parsed && parsed.flow === 'popup') {
      flow = 'popup';
    }
  } catch {
    // Plain state string is also accepted by server.
  }

  const clientNonce =
    options.clientNonce ??
    readClientNonce(
      options.windowRef?.sessionStorage,
      options.windowRef?.localStorage
    );
  let response;
  try {
    response = await fetchImpl('/api/oauth/callback', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildWebAuthHeaders({ includeJson: true }),
      body: JSON.stringify({
        code,
        state: innerState,
        ...(clientNonce ? { client_nonce: clientNonce } : {}),
      }),
    });
  } catch (error) {
    guard.release(guardKey);
    throw error;
  }
  if (response.status >= 500) {
    guard.release(guardKey);
    return { ok: false, status: response.status, flow };
  }
  guard.commit(guardKey);
  stripAuthParamsFromUrl(options.windowRef);
  if (!response.ok) {
    return { ok: false, status: response.status, flow };
  }
  const payload = await response.json().catch(() => ({}));
  return {
    ok: true,
    status: response.status,
    redirectUri:
      typeof payload?.redirectUri === 'string' ? payload.redirectUri : '/',
    flow,
  };
}

/**
 * Completes a `/magic-link` callback once.
 *
 * @param {Object} options
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} options.email
 * @param {string} options.token
 * @param {ReturnType<typeof createSingleUseCodeGuard>} [options.codeGuard]
 * @param {Window | null} [options.windowRef]
 * @returns {Promise<{ ok: boolean, status: number, duplicate?: boolean }>}
 */
export async function completeMagicLink(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const email = String(options.email || '').trim();
  const token = String(options.token || '').trim();
  if (!email || !token) {
    return { ok: false, status: 400 };
  }
  const guard =
    options.codeGuard ||
    createSingleUseCodeGuard(options.windowRef?.sessionStorage);
  const guardKey = `magic:${token}`;
  if (!guard.acquire(guardKey)) {
    return { ok: false, status: 409, duplicate: true };
  }
  let response;
  try {
    response = await fetchImpl('/api/auth/magic-link', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildWebAuthHeaders({ includeJson: true }),
      body: JSON.stringify({ email, token }),
    });
  } catch (error) {
    guard.release(guardKey);
    throw error;
  }
  if (response.status >= 500) {
    guard.release(guardKey);
    return { ok: false, status: response.status };
  }
  guard.commit(guardKey);
  stripAuthParamsFromUrl(options.windowRef);
  return { ok: Boolean(response.ok), status: response.status };
}

/**
 * Completes an `/open-app` sign-in code exchange once.
 *
 * @param {Object} options
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} options.code
 * @param {ReturnType<typeof createSingleUseCodeGuard>} [options.codeGuard]
 * @param {Window | null} [options.windowRef]
 * @returns {Promise<{ ok: boolean, status: number, duplicate?: boolean }>}
 */
export async function completeOpenAppSignIn(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const code = String(options.code || '').trim();
  if (!code) {
    return { ok: false, status: 400 };
  }
  const guard =
    options.codeGuard ||
    createSingleUseCodeGuard(options.windowRef?.sessionStorage);
  const guardKey = `open-app:${code}`;
  if (!guard.acquire(guardKey)) {
    return { ok: false, status: 409, duplicate: true };
  }
  let response;
  try {
    response = await fetchImpl('/api/auth/open-app/sign-in', {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildWebAuthHeaders({ includeJson: true }),
      body: JSON.stringify({ code }),
    });
  } catch (error) {
    guard.release(guardKey);
    throw error;
  }
  if (response.status >= 500) {
    guard.release(guardKey);
    return { ok: false, status: response.status };
  }
  guard.commit(guardKey);
  stripAuthParamsFromUrl(options.windowRef);
  return { ok: Boolean(response.ok), status: response.status };
}

/**
 * Boots the zero-framework standalone authentication page for all Web auth
 * routes (`/sign-in`, `/magic-link`, `/oauth/*`, `/redirect-proxy`,
 * `/open-app/*`). Uses same-origin endpoints only.
 *
 * @param {Object} [env]
 * @param {Window} [env.win]
 * @param {Document} [env.doc]
 * @param {typeof fetch} [env.fetchImpl]
 * @param {ReturnType<typeof createSingleUseCodeGuard>} [env.codeGuard]
 */
export async function bootSignInPage(env = {}) {
  const win = env.win || globalThis.window;
  const doc = env.doc || globalThis.document;
  if (!win || !doc) {
    return null;
  }

  const fetchImpl = env.fetchImpl || win.fetch.bind(win);
  const href =
    win.location.href ||
    `https://app.affine.pro${win.location.pathname || '/sign-in'}${win.location.search || ''}`;
  const currentUrl = new URL(href);
  const route = classifyAuthRoute(currentUrl.pathname);
  const statusEl = doc.getElementById('auth-status');
  const codeGuard =
    env.codeGuard || createSingleUseCodeGuard(win.sessionStorage);

  /** @param {string} target */
  function navigateTo(target) {
    if (typeof win.location.replace === 'function') {
      win.location.replace(target);
    } else if (typeof win.location.assign === 'function') {
      win.location.assign(target);
    } else {
      win.location.href = target;
    }
  }

  if (route === 'redirect-proxy') {
    const target = currentUrl.searchParams.get('redirect_uri');
    if (isAllowedRedirectTarget(target, currentUrl.origin)) {
      if (statusEl) {
        statusEl.textContent = 'Redirecting...';
      }
      navigateTo(/** @type {string} */ (target));
      return { route, redirected: true, target };
    }
    if (statusEl) {
      statusEl.textContent = 'Blocked untrusted redirect target.';
    }
    return { route, redirected: false, target: null };
  }

  if (route === 'open-app') {
    const appUrl = currentUrl.searchParams.get('url');
    const code = currentUrl.searchParams.get('code');
    if (appUrl) {
      if (isAllowedNativeAppUrl(appUrl)) {
        if (statusEl) {
          statusEl.textContent = 'Opening AFFiNE app...';
        }
        navigateTo(appUrl);
        return { route, handedOff: true, target: appUrl };
      }
      if (statusEl) {
        statusEl.textContent = 'Blocked invalid app URL.';
      }
      return { route, handedOff: false, target: null };
    }
    if (code) {
      const result = await completeOpenAppSignIn({
        fetchImpl,
        code,
        codeGuard,
        windowRef: win,
      });
      if (result.ok) {
        const nextUrl = resolveSafeAuthRedirect(
          currentUrl.searchParams.get('redirect_uri'),
          currentUrl.origin
        );
        if (statusEl) {
          statusEl.textContent = 'Signed in.';
        }
        navigateTo(nextUrl);
        return { route, result, target: nextUrl };
      }
      if (statusEl) {
        statusEl.textContent = result.duplicate
          ? 'Sign-in code already used.'
          : `Open-app sign-in failed (${result.status}).`;
      }
      return { route, result };
    }
    if (statusEl) {
      statusEl.textContent = 'Handling open-app...';
    }
    return { route };
  }

  if (route === 'magic-link') {
    const email = currentUrl.searchParams.get('email') || '';
    const token = currentUrl.searchParams.get('token') || '';
    const client = currentUrl.searchParams.get('client');
    const redirectUri = currentUrl.searchParams.get('redirect_uri');

    if (!email || !token) {
      if (statusEl) {
        statusEl.textContent = 'Invalid magic link.';
      }
      return { route, ok: false, status: 400 };
    }
    if (client && client !== WEB_CLIENT_KIND) {
      if (!NATIVE_CLIENT_SCHEMES.has(client)) {
        if (statusEl) {
          statusEl.textContent = 'Invalid magic link client.';
        }
        return { route, ok: false, status: 400 };
      }
      const deepLink = new URL(`${client}://authentication`);
      deepLink.searchParams.set('method', 'magic-link');
      deepLink.searchParams.set(
        'payload',
        JSON.stringify({ email, token, redirectUri })
      );
      deepLink.searchParams.set('server', currentUrl.origin);
      const handoff = `/open-app/url?url=${encodeURIComponent(deepLink.toString())}`;
      navigateTo(handoff);
      return { route, handedOff: true, target: handoff };
    }

    const result = await completeMagicLink({
      fetchImpl,
      email,
      token,
      codeGuard,
      windowRef: win,
    });
    if (result.ok) {
      const nextUrl = resolveSafeAuthRedirect(redirectUri, currentUrl.origin);
      if (statusEl) {
        statusEl.textContent = 'Signed in.';
      }
      navigateTo(nextUrl);
      return { route, result, target: nextUrl };
    }
    if (statusEl) {
      statusEl.textContent = result.duplicate
        ? 'Magic link already used.'
        : `Magic link sign-in failed (${result.status}).`;
    }
    return { route, result };
  }

  if (route === 'oauth') {
    if (currentUrl.pathname.endsWith('/login')) {
      const provider = currentUrl.searchParams.get('provider') || '';
      const client = currentUrl.searchParams.get('client') || WEB_CLIENT_KIND;
      const redirectUri = currentUrl.searchParams.get('redirect_uri');
      const flow =
        currentUrl.searchParams.get('flow') === 'popup' ? 'popup' : 'redirect';
      const result = await startOAuthLogin({
        fetchImpl,
        provider,
        client,
        redirectUri,
        flow,
        documentRef: doc,
        sessionStorage: win.sessionStorage,
        localStorage: win.localStorage,
      });
      if (result.ok && result.url) {
        if (statusEl) {
          statusEl.textContent = `Continuing with ${provider}...`;
        }
        navigateTo(result.url);
        return { route, result };
      }
      if (statusEl) {
        statusEl.textContent = `OAuth start failed (${result.status}).`;
      }
      return { route, result };
    }

    const code = currentUrl.searchParams.get('code') || '';
    const state = currentUrl.searchParams.get('state') || '';
    if (code && state) {
      // Check for native client OAuth handoff BEFORE consuming the single-use
      // code (1:1 aligned with 0.27.5 `oauth-callback.tsx:38-71`).
      let parsedState = null;
      try {
        parsedState = JSON.parse(state);
      } catch {
        parsedState = null;
      }
      if (
        parsedState &&
        typeof parsedState.client === 'string' &&
        parsedState.client &&
        parsedState.client !== WEB_CLIENT_KIND
      ) {
        if (
          !NATIVE_CLIENT_SCHEMES.has(parsedState.client) ||
          !parsedState.state ||
          !parsedState.provider
        ) {
          if (statusEl) {
            statusEl.textContent = 'Invalid OAuth callback parameters.';
          }
          return { route, ok: false, status: 400 };
        }
        const flow = parsedState.flow === 'popup' ? 'popup' : 'redirect';
        const deepParams = new URLSearchParams();
        deepParams.set('method', 'oauth');
        deepParams.set(
          'payload',
          JSON.stringify({
            state: parsedState.state,
            code,
            flow,
            provider: parsedState.provider,
          })
        );
        deepParams.set('server', currentUrl.origin);
        const deepLink = `${parsedState.client}://authentication?${deepParams.toString()}`;
        const handoff = `/open-app/url?url=${encodeURIComponent(deepLink)}`;
        navigateTo(handoff);
        return { route, handedOff: true, target: handoff };
      }

      const result = await completeOAuthCallback({
        fetchImpl,
        code,
        state,
        codeGuard,
        windowRef: win,
      });
      if (result.ok) {
        if (result.flow === 'popup' && typeof win.close === 'function') {
          win.close();
          return { route, result, closedPopup: true };
        }
        const nextUrl = resolveSafeAuthRedirect(
          result.redirectUri,
          currentUrl.origin
        );
        if (statusEl) {
          statusEl.textContent = 'Signed in.';
        }
        navigateTo(nextUrl);
        return { route, result, target: nextUrl };
      }
      if (statusEl) {
        statusEl.textContent = result.duplicate
          ? 'OAuth code already consumed.'
          : `OAuth sign-in failed (${result.status}).`;
      }
      return { route, result };
    }

    if (statusEl) {
      statusEl.textContent = 'Missing OAuth callback parameters.';
    }
    return { route, ok: false, status: 400 };
  }

  if (statusEl && route !== 'sign-in') {
    statusEl.textContent = `Handling ${route}...`;
  }

  const clientVersion = env.clientVersion || resolveClientVersion(doc);
  const nowImpl =
    typeof env.nowImpl === 'function' ? env.nowImpl : () => Date.now();
  const setIntervalImpl =
    env.setIntervalImpl ||
    (typeof win.setInterval === 'function'
      ? win.setInterval.bind(win)
      : globalThis.setInterval);
  const clearIntervalImpl =
    env.clearIntervalImpl ||
    (typeof win.clearInterval === 'function'
      ? win.clearInterval.bind(win)
      : globalThis.clearInterval);

  const legalNoticeEl = doc.getElementById('auth-legal-notice');
  /** @param {string | null | undefined} deploymentType */
  function syncLegalNoticeVisibility(deploymentType) {
    if (!legalNoticeEl) {
      return;
    }
    const showLegal =
      typeof env.showLegalNotice === 'boolean'
        ? env.showLegalNotice
        : deploymentType
          ? deploymentType.toLowerCase() === 'affine'
          : isOfficialCloudHost(currentUrl.hostname);
    legalNoticeEl.hidden = !showLegal;
  }
  syncLegalNoticeVisibility(null);

  // Bind `#use-local-btn` synchronously BEFORE any async network calls so
  // offline users can always skip sign-in immediately.
  const useLocalBtn = doc.getElementById('use-local-btn');
  useLocalBtn?.addEventListener?.('click', () => {
    navigateTo('/');
  });

  /** @param {string} text @param {'info' | 'error'} [tone='info'] */
  function setStatus(text, tone = 'info') {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = text;
    if (statusEl.dataset) {
      statusEl.dataset.tone = tone;
    }
  }

  const initialError = currentUrl.searchParams.get('error');
  if (initialError && initialError.trim()) {
    setStatus(initialError.trim(), 'error');
  }

  /** @type {string | null} */
  let captchaToken = null;
  let captchaRequired = false;
  /** @type {(() => void) | null} */
  let resetTurnstile = null;
  /** @type {'email' | 'password' | 'otp'} */
  let currentStep = 'email';
  let passwordAvailable = false;
  let preflightSeq = 0;
  let stepEpoch = 0;
  let stepBoundEmail = '';
  /** @type {Map<string, number>} */
  const otpSendingCountByEmail = new Map();
  let resendCooldown = 0;
  /** @type {string} */
  let activeCooldownEmail = '';
  /** @type {Map<string, number>} */
  const resendCooldownUntilByEmail = new Map();
  /** @type {unknown} */
  let resendTimerId = null;
  const submitButtonEl = /** @type {HTMLButtonElement | null} */ (
    doc.getElementById('submit-button')
  );
  const passwordSubmitButtonEl = /** @type {HTMLButtonElement | null} */ (
    doc.getElementById('password-submit-button')
  );
  const switchToOtpBtn = /** @type {HTMLButtonElement | null} */ (
    doc.getElementById('switch-to-otp-btn')
  );
  const resendOtpBtn = /** @type {HTMLButtonElement | null} */ (
    doc.getElementById('resend-otp-btn')
  );

  function normalizeEmailKey(emailVal) {
    return String(emailVal || '')
      .trim()
      .toLowerCase();
  }

  function isOtpSendInFlightFor(emailVal) {
    const key = normalizeEmailKey(emailVal);
    return key ? (otpSendingCountByEmail.get(key) || 0) > 0 : false;
  }

  function remainingCooldownSeconds(emailVal) {
    const key = normalizeEmailKey(emailVal);
    if (!key) {
      return 0;
    }
    const until = resendCooldownUntilByEmail.get(key) || 0;
    const remainingMs = until - nowImpl();
    if (remainingMs <= 0) {
      resendCooldownUntilByEmail.delete(key);
      return 0;
    }
    return Math.ceil(remainingMs / 1000);
  }

  function syncSubmitButtonsDisabled() {
    const waitingForCaptcha = captchaRequired && !captchaToken;
    const stepOtpInFlight =
      (currentStep === 'otp' || currentStep === 'password') &&
      isOtpSendInFlightFor(stepBoundEmail);
    if (submitButtonEl) {
      submitButtonEl.disabled = waitingForCaptcha;
    }
    if (passwordSubmitButtonEl) {
      passwordSubmitButtonEl.disabled = waitingForCaptcha;
    }
    if (switchToOtpBtn) {
      switchToOtpBtn.disabled = waitingForCaptcha || stepOtpInFlight;
    }
    if (resendOtpBtn) {
      resendOtpBtn.disabled =
        waitingForCaptcha || stepOtpInFlight || resendCooldown > 0;
    }
  }

  function clearResendTimer() {
    if (resendTimerId !== null) {
      clearIntervalImpl?.(resendTimerId);
      resendTimerId = null;
    }
    resendCooldown = 0;
    activeCooldownEmail = '';
    if (resendOtpBtn) {
      resendOtpBtn.textContent = 'Resend code';
    }
    syncSubmitButtonsDisabled();
  }

  function runResendCountdown(emailVal) {
    clearResendTimer();
    const key = normalizeEmailKey(emailVal);
    const remaining = remainingCooldownSeconds(key);
    if (remaining <= 0) {
      return;
    }
    activeCooldownEmail = key;
    resendCooldown = remaining;
    if (resendOtpBtn) {
      resendOtpBtn.textContent = `Resend in ${resendCooldown}s`;
    }
    syncSubmitButtonsDisabled();
    if (typeof setIntervalImpl === 'function') {
      resendTimerId = setIntervalImpl(() => {
        const nextRemaining = remainingCooldownSeconds(activeCooldownEmail);
        if (nextRemaining <= 0) {
          clearResendTimer();
          return;
        }
        resendCooldown = nextRemaining;
        if (resendOtpBtn) {
          resendOtpBtn.textContent = `Resend in ${resendCooldown}s`;
        }
        syncSubmitButtonsDisabled();
      }, 1000);
      if (
        resendTimerId &&
        typeof (/** @type {{ unref?: Function }} */ (resendTimerId).unref) ===
          'function'
      ) {
        /** @type {{ unref: () => void }} */ (resendTimerId).unref();
      }
    }
  }

  function recordCooldownDeadline(
    emailVal,
    seconds = OTP_RESEND_COOLDOWN_SECONDS
  ) {
    const key = normalizeEmailKey(emailVal);
    if (key && seconds > 0) {
      resendCooldownUntilByEmail.set(
        key,
        nowImpl() + Math.floor(seconds) * 1000
      );
    }
    return key;
  }

  const container = doc.getElementById('turnstile-container');
  const captcha = await maybeLoadTurnstile({
    fetchImpl,
    documentRef: doc,
    windowRef: win,
    container,
    onToken: token => {
      captchaToken = token;
      syncSubmitButtonsDisabled();
    },
    onResetReady: resetFn => {
      resetTurnstile = () => {
        resetFn();
        syncSubmitButtonsDisabled();
      };
    },
  });
  captchaRequired = Boolean(captcha.loaded);
  syncSubmitButtonsDisabled();
  const captchaChallenge =
    'challenge' in captcha && typeof captcha.challenge === 'string'
      ? captcha.challenge
      : null;

  const authCard = doc.getElementById('auth-card');
  const stepEmailEl = doc.getElementById('step-email');
  const stepPasswordEl = doc.getElementById('step-password');
  const stepOtpEl = doc.getElementById('step-otp');
  const stepEmailDisplay = doc.getElementById('step-email-display');
  const otpEmailDisplay = doc.getElementById('otp-email-display');
  const oauthContainer = doc.getElementById('oauth-providers');
  const oauthDivider = doc.getElementById('oauth-divider');
  const switchToPasswordBtn = doc.getElementById('switch-to-password-btn');
  const backFromPasswordBtn = doc.getElementById('back-from-password-btn');
  const backFromOtpBtn = doc.getElementById('back-from-otp-btn');

  const redirectUriParam = currentUrl.searchParams.get('redirect_uri');
  const clientParam = currentUrl.searchParams.get('client');
  const magicLinkParams = new URLSearchParams();
  if (redirectUriParam) {
    magicLinkParams.set('redirect_uri', redirectUriParam);
  }
  if (clientParam) {
    magicLinkParams.set('client', clientParam);
  }
  const magicLinkQuery = magicLinkParams.toString();
  const magicLinkCallbackUrl = magicLinkQuery
    ? `/magic-link?${magicLinkQuery}`
    : '/magic-link';

  /**
   * @param {'email' | 'password' | 'otp'} nextStep
   * @param {string} [emailText]
   */
  function setStep(nextStep, emailText) {
    stepEpoch += 1;
    currentStep = nextStep;
    if (nextStep === 'email') {
      stepBoundEmail = '';
    } else if (emailText !== undefined) {
      stepBoundEmail = String(emailText).trim();
    }
    if (authCard?.dataset) {
      authCard.dataset.step = nextStep;
    }
    if (stepEmailEl) {
      stepEmailEl.hidden = nextStep !== 'email';
    }
    if (stepPasswordEl) {
      stepPasswordEl.hidden = nextStep !== 'password';
    }
    if (stepOtpEl) {
      stepOtpEl.hidden = nextStep !== 'otp';
    }
    if (emailText !== undefined) {
      if (stepEmailDisplay) {
        stepEmailDisplay.textContent = emailText;
      }
      if (otpEmailDisplay) {
        otpEmailDisplay.textContent = emailText;
      }
    }
    if (switchToPasswordBtn) {
      switchToPasswordBtn.hidden = !passwordAvailable;
    }
    syncSubmitButtonsDisabled();
  }

  if (oauthContainer || legalNoticeEl) {
    const serverOAuth = await fetchOAuthProviders({ fetchImpl, clientVersion });
    syncLegalNoticeVisibility(serverOAuth.deploymentType);
    if (oauthContainer) {
      renderOAuthProviders({
        doc,
        container: oauthContainer,
        divider: oauthDivider,
        providers: serverOAuth.providers,
        redirectUri: redirectUriParam,
        onNavigate: navigateTo,
      });
    }
  }

  const clearStepSecrets = () => {
    const pwdEl = /** @type {HTMLInputElement | null} */ (
      doc.getElementById('password')
    );
    const codeEl = /** @type {HTMLInputElement | null} */ (
      doc.getElementById('otp')
    );
    if (pwdEl) {
      pwdEl.value = '';
    }
    if (codeEl) {
      codeEl.value = '';
    }
  };

  backFromPasswordBtn?.addEventListener?.('click', () => {
    preflightSeq += 1;
    clearResendTimer();
    clearStepSecrets();
    setStep('email');
    setStatus('');
    resetTurnstile?.();
  });
  backFromOtpBtn?.addEventListener?.('click', () => {
    preflightSeq += 1;
    clearResendTimer();
    clearStepSecrets();
    setStep('email');
    setStatus('');
    resetTurnstile?.();
  });
  doc.getElementById('email')?.addEventListener?.('input', () => {
    if (currentStep === 'email') {
      preflightSeq += 1;
      clearStepSecrets();
    }
  });
  switchToPasswordBtn?.addEventListener?.('click', () => {
    preflightSeq += 1;
    clearResendTimer();
    const emailVal =
      stepBoundEmail ||
      (/** @type {HTMLInputElement | null} */
      (doc.getElementById('email'))?.value || '').trim();
    setStep('password', emailVal);
    setStatus('');
    resetTurnstile?.();
  });

  async function triggerMagicLinkSend(emailVal) {
    const boundEmail = String(emailVal || '').trim();
    const emailKey = normalizeEmailKey(boundEmail);
    if (!emailKey || isOtpSendInFlightFor(emailKey)) {
      return { ok: false, status: 0, method: 'magic-link-send' };
    }
    if (remainingCooldownSeconds(emailKey) > 0) {
      if (
        currentStep === 'otp' &&
        normalizeEmailKey(stepBoundEmail) === emailKey
      ) {
        runResendCountdown(emailKey);
      }
      return {
        ok: true,
        status: 200,
        method: 'magic-link-send',
        skipped: true,
      };
    }
    const sendEpoch = stepEpoch;
    const isSameStepAttempt = () =>
      sendEpoch === stepEpoch &&
      currentStep === 'otp' &&
      normalizeEmailKey(stepBoundEmail) === emailKey;
    const isCurrentEmailOtpStep = () =>
      currentStep === 'otp' && normalizeEmailKey(stepBoundEmail) === emailKey;
    otpSendingCountByEmail.set(
      emailKey,
      (otpSendingCountByEmail.get(emailKey) || 0) + 1
    );
    syncSubmitButtonsDisabled();
    try {
      const sendRes = await submitSignInForm({
        fetchImpl,
        endpoint: '/api/auth/sign-in',
        email: boundEmail,
        callbackUrl: magicLinkCallbackUrl,
        captchaProvider: captcha.provider,
        captchaToken,
        captchaChallenge,
        clientVersion,
        clientNonce: readClientNonce(win.sessionStorage, win.localStorage),
      });
      if (sendRes.ok) {
        recordCooldownDeadline(emailKey);
      }
      if (isSameStepAttempt()) {
        resetTurnstile?.();
      }
      if (!isCurrentEmailOtpStep()) {
        return {
          ok: false,
          status: sendRes.status,
          method: 'magic-link-send',
          stale: true,
        };
      }
      if (!sendRes.ok) {
        setStatus(`Failed to send code (${sendRes.status}).`, 'error');
      } else {
        runResendCountdown(emailKey);
        setStatus('');
      }
      return sendRes;
    } catch {
      if (isSameStepAttempt()) {
        resetTurnstile?.();
      }
      if (isCurrentEmailOtpStep()) {
        setStatus('Network error. Please try again.', 'error');
      }
      return { ok: false, status: 0, method: 'magic-link-send' };
    } finally {
      const remainingInFlight = (otpSendingCountByEmail.get(emailKey) || 1) - 1;
      if (remainingInFlight <= 0) {
        otpSendingCountByEmail.delete(emailKey);
      } else {
        otpSendingCountByEmail.set(emailKey, remainingInFlight);
      }
      syncSubmitButtonsDisabled();
    }
  }

  switchToOtpBtn?.addEventListener?.('click', async () => {
    preflightSeq += 1;
    const emailVal =
      stepBoundEmail ||
      (/** @type {HTMLInputElement | null} */
      (doc.getElementById('email'))?.value || '').trim();
    setStep('otp', emailVal);
    await triggerMagicLinkSend(emailVal);
  });
  resendOtpBtn?.addEventListener?.('click', async () => {
    const emailVal =
      stepBoundEmail ||
      (/** @type {HTMLInputElement | null} */
      (doc.getElementById('email'))?.value || '').trim();
    const res = await triggerMagicLinkSend(emailVal);
    if (res.ok && !res.skipped) {
      setStatus('A new verification code has been sent.', 'info');
    }
  });

  const form = doc.getElementById('sign-in-form');
  if (form && typeof form.addEventListener === 'function') {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const emailEl = /** @type {HTMLInputElement | null} */ (
        doc.getElementById('email')
      );
      const passwordEl = /** @type {HTMLInputElement | null} */ (
        doc.getElementById('password')
      );
      const otpEl = /** @type {HTMLInputElement | null} */ (
        doc.getElementById('otp')
      );
      const emailVal = (emailEl?.value || '').trim();
      const passwordVal = passwordEl?.value || '';
      const otpVal = (otpEl?.value || '').trim();

      if (authCard && currentStep === 'email') {
        const seq = ++preflightSeq;
        const reqEmail = emailVal;
        const isStalePreflight = () =>
          seq !== preflightSeq ||
          currentStep !== 'email' ||
          (emailEl?.value || '').trim() !== reqEmail;
        clearStepSecrets();
        try {
          const preRes = await fetchImpl('/api/auth/preflight', {
            method: 'POST',
            credentials: 'same-origin',
            headers: buildWebAuthHeaders({ includeJson: true, clientVersion }),
            body: JSON.stringify({ email: reqEmail }),
          });
          if (isStalePreflight()) {
            return;
          }
          if (!preRes.ok) {
            setStatus(`Unable to verify account (${preRes.status}).`, 'error');
            return;
          }
          const preData = await preRes.json();
          if (isStalePreflight()) {
            return;
          }
          const methods = preData?.methods;
          passwordAvailable = Boolean(methods?.password?.available);
          if (passwordAvailable) {
            setStep('password', reqEmail);
            setStatus('');
            return;
          }
          const magicLinkUnavailable =
            methods?.magicLink?.available === false ||
            methods?.email?.available === false ||
            (methods &&
              typeof methods === 'object' &&
              Object.keys(methods).length > 0 &&
              Object.values(methods).every(
                m => m && typeof m === 'object' && m.available === false
              ));
          if (magicLinkUnavailable) {
            setStatus(
              'Email sign-in is not available for this account.',
              'error'
            );
            return;
          }
          setStep('otp', reqEmail);
          await triggerMagicLinkSend(reqEmail);
          return;
        } catch {
          if (isStalePreflight()) {
            return;
          }
          setStatus('Network error while checking account.', 'error');
          return;
        }
      }

      if (authCard && currentStep === 'password' && !passwordVal) {
        setStatus('Please enter your password.', 'error');
        return;
      }

      if (authCard && currentStep === 'otp' && !/^\d{6}$/.test(otpVal)) {
        setStatus(INVALID_OTP_MESSAGE, 'error');
        return;
      }

      const submitEmail =
        currentStep === 'password' || currentStep === 'otp'
          ? stepBoundEmail || emailVal
          : emailVal;

      const result = await submitSignInForm({
        fetchImpl,
        endpoint: form.getAttribute?.('action') || '/api/auth/sign-in',
        email: submitEmail,
        password: currentStep === 'otp' ? '' : passwordVal,
        otp: currentStep === 'password' ? '' : otpVal,
        callbackUrl: magicLinkCallbackUrl,
        captchaProvider: captcha.provider,
        captchaToken,
        captchaChallenge,
        clientVersion,
        clientNonce: readClientNonce(win.sessionStorage, win.localStorage),
      });
      if (result.method !== 'magic-link-otp') {
        resetTurnstile?.();
      }
      const errorText =
        result.method === 'magic-link-otp' &&
        (result.status === 400 || result.status === 401)
          ? INVALID_OTP_MESSAGE
          : `Sign-in failed (${result.status}).`;
      setStatus(
        result.ok
          ? result.method === 'magic-link-send'
            ? 'Check your email for the sign-in link.'
            : 'Signed in.'
          : errorText,
        result.ok ? 'info' : 'error'
      );
      if (result.ok && result.method !== 'magic-link-send') {
        clearResendTimer();
        navigateTo(
          resolveSafeAuthRedirect(redirectUriParam, currentUrl.origin)
        );
      }
    });
  }

  return {
    route,
    captcha,
    getStep: () => currentStep,
    getCaptchaToken: () => captchaToken,
    getResendCooldown: () => resendCooldown,
    resetTurnstile: () => resetTurnstile?.(),
    dispose: () => clearResendTimer(),
  };
}

if (
  globalThis.window !== undefined &&
  globalThis.document !== undefined &&
  !globalThis.__AFFINE_WEB_HOST_TEST__
) {
  void bootSignInPage();
}
