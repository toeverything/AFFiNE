// @ts-check

export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

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
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    return { loaded: false, provider: null, siteKey: null, action: null };
  }

  /** @type {{ provider?: string, siteKey?: string, action?: string } | null} */
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

  if (!siteKey || provider.toLowerCase() !== 'turnstile') {
    return { loaded: false, provider: null, siteKey: null, action: null };
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
  function renderWidget() {
    if (rendered || !options.container) {
      return;
    }
    const turnstileApi = /** @type {{ turnstile?: { render?: Function } }} */ (
      /** @type {unknown} */ (winRef || globalThis)
    ).turnstile;
    if (turnstileApi && typeof turnstileApi.render === 'function') {
      rendered = true;
      turnstileApi.render(options.container, {
        sitekey: siteKey,
        ...(action ? { action } : {}),
        callback: token => {
          if (typeof token === 'string' && options.onToken) {
            options.onToken(token);
          }
        },
      });
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

  return { loaded: true, provider: 'turnstile', siteKey, action };
}

/**
 * Submits credentials as `application/json`, attaching `x-captcha-provider`
 * and `x-captcha-token` headers whenever a captcha token is present.
 *
 * @param {Object} options
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.endpoint='/api/auth/sign-in']
 * @param {string} options.email
 * @param {string} [options.password]
 * @param {string} [options.otp]
 * @param {string | null} [options.captchaProvider]
 * @param {string | null} [options.captchaToken]
 * @returns {Promise<{ ok: boolean, status: number }>}
 */
export async function submitSignInForm(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const endpoint = options.endpoint || '/api/auth/sign-in';
  /** @type {Record<string, string>} */
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (options.captchaToken) {
    headers['x-captcha-provider'] = options.captchaProvider || 'turnstile';
    headers['x-captcha-token'] = options.captchaToken;
  }
  /** @type {Record<string, string>} */
  const body = { email: options.email };
  if (options.password) {
    body.password = options.password;
  }
  if (options.otp) {
    body.otp = options.otp;
  }
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body),
  });
  return { ok: Boolean(response.ok), status: response.status };
}

/**
 * Boots the zero-framework standalone authentication page.
 *
 * @param {Object} [env]
 * @param {Window} [env.win]
 * @param {Document} [env.doc]
 * @param {typeof fetch} [env.fetchImpl]
 */
export async function bootSignInPage(env = {}) {
  const win = env.win || globalThis.window;
  const doc = env.doc || globalThis.document;
  if (!win || !doc) {
    return null;
  }

  const fetchImpl = env.fetchImpl || win.fetch.bind(win);
  const route = classifyAuthRoute(win.location.pathname);
  const statusEl = doc.getElementById('auth-status');
  if (statusEl && route !== 'sign-in') {
    statusEl.textContent = `Handling ${route}...`;
  }

  /** @type {string | null} */
  let captchaToken = null;
  const container = doc.getElementById('turnstile-container');
  const captcha = await maybeLoadTurnstile({
    fetchImpl,
    documentRef: doc,
    windowRef: win,
    container,
    onToken: token => {
      captchaToken = token;
    },
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
      const result = await submitSignInForm({
        fetchImpl,
        endpoint: form.getAttribute?.('action') || '/api/auth/sign-in',
        email: emailEl?.value || '',
        password: passwordEl?.value || '',
        otp: otpEl?.value || '',
        captchaProvider: captcha.provider,
        captchaToken,
      });
      if (statusEl) {
        statusEl.textContent = result.ok
          ? 'Signed in.'
          : `Sign-in failed (${result.status}).`;
      }
    });
  }

  return { route, captcha, getCaptchaToken: () => captchaToken };
}

if (
  globalThis.window !== undefined &&
  globalThis.document !== undefined &&
  !globalThis.__AFFINE_WEB_HOST_TEST__
) {
  void bootSignInPage();
}
