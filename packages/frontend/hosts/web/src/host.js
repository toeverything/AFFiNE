// @ts-check

import { createA11yTree } from './a11y.js';
import {
  createIdbV1ReadonlyReader,
  createIdbWorkspaceStorage,
  createPendingWriteFlusher,
  getLocalWorkspaceIds,
  getWebPreference,
  LOCAL_WORKSPACE_CHANGED_CHANNEL,
  setLocalWorkspaceIds,
  setWebPreference,
} from './idb-storage.js';
import { createPdfPreviewClient } from './pdf-client.js';
import {
  attachImeSelectionGuard,
  executeClipboardAction,
} from './selection-overlay.js';
import { createWorkerLoader, readEmbeddedManifest } from './worker-loader.js';

/**
 * @typedef {Object} SafeAreaInsets
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 * @property {number} left
 */

/**
 * @typedef {Object} GraphicsSupport
 * @property {boolean} webgpu
 * @property {boolean} webgl2
 * @property {boolean} supported
 */

/**
 * @typedef {Object} FlushNavigationOptions
 * @property {() => void} pauseInput
 * @property {() => Promise<boolean | { ok: boolean }>} flushPendingWrites
 * @property {(url: string) => void} navigate
 * @property {string} targetUrl
 * @property {() => void} [resumeInput]
 */

const SINGLE_USE_OAUTH_PARAMS = ['code', 'state'];
const ALLOWED_SANDBOX_TOKENS = new Set([
  'allow-scripts',
  'allow-forms',
  'allow-popups',
]);

/**
 * Parses a computed CSS pixel value into a finite non-negative number.
 *
 * @param {string | null | undefined} value
 * @returns {number}
 */
function parseCssPx(value) {
  if (!value) {
    return 0;
  }
  const num = Number.parseFloat(String(value).replace(/px$/i, '').trim());
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

/**
 * Probes WebGPU and WebGL2 availability using a disposable offscreen canvas so
 * the primary `#app-canvas` is never locked to a WebGL2 context before WebGPU
 * initialization.
 *
 * @param {Document | null | undefined} doc
 * @param {{ gpu?: unknown } | undefined} nav
 * @returns {GraphicsSupport}
 */
export function detectGraphicsSupport(doc, nav = globalThis.navigator) {
  const webgpu = Boolean(nav && nav.gpu);
  let webgl2 = false;
  if (doc && typeof doc.createElement === 'function') {
    try {
      const probeCanvas = doc.createElement('canvas');
      if (probeCanvas && typeof probeCanvas.getContext === 'function') {
        probeCanvas.width = 1;
        probeCanvas.height = 1;
        const gl = probeCanvas.getContext('webgl2');
        if (gl) {
          webgl2 = true;
          gl.getExtension?.('WEBGL_lose_context')?.loseContext?.();
        }
      }
    } catch {
      webgl2 = false;
    }
  }
  return {
    webgpu,
    webgl2,
    supported: webgpu || webgl2,
  };
}

/**
 * Returns true when the URL already targets the legacy shell (`?shell=legacy`).
 *
 * @param {string} currentHref
 * @returns {boolean}
 */
export function isLegacyShellUrl(currentHref) {
  try {
    return new URL(currentHref).searchParams.get('shell') === 'legacy';
  } catch {
    return false;
  }
}

/**
 * Builds the `?shell=legacy` fallback URL while preserving query parameters
 * and hash. By default (`codeConsumed = false`), single-use OAuth `code` is
 * preserved untouched so the legacy shell consumes it once; when `codeConsumed`
 * is `true`, `code` is stripped to prevent double consumption.
 *
 * @param {string} currentHref
 * @param {{ codeConsumed?: boolean }} [options]
 * @returns {{ url: string, oauthCodeStripped: boolean }}
 */
export function buildLegacyFallbackUrl(currentHref, options = {}) {
  const codeConsumed = Boolean(options.codeConsumed);
  const target = new URL(currentHref);
  let oauthCodeStripped = false;
  if (codeConsumed) {
    for (const param of SINGLE_USE_OAUTH_PARAMS) {
      if (target.searchParams.has(param)) {
        target.searchParams.delete(param);
        oauthCodeStripped = true;
      }
    }
  }
  target.searchParams.set('shell', 'legacy');
  return {
    url: target.toString(),
    oauthCodeStripped,
  };
}

/**
 * Tracks per-side safe-area insets with exact four-edge comparison.
 *
 * @param {(insets: SafeAreaInsets) => void} onChange
 */
export function createSafeAreaTracker(onChange) {
  /** @type {SafeAreaInsets | null} */
  let last = null;

  /**
   * @param {SafeAreaInsets} next
   * @returns {boolean}
   */
  function update(next) {
    const normalized = {
      top: Number.isFinite(next.top) && next.top >= 0 ? next.top : 0,
      right: Number.isFinite(next.right) && next.right >= 0 ? next.right : 0,
      bottom:
        Number.isFinite(next.bottom) && next.bottom >= 0 ? next.bottom : 0,
      left: Number.isFinite(next.left) && next.left >= 0 ? next.left : 0,
    };
    const changed =
      last === null ||
      !Object.is(last.top, normalized.top) ||
      !Object.is(last.right, normalized.right) ||
      !Object.is(last.bottom, normalized.bottom) ||
      !Object.is(last.left, normalized.left);
    if (!changed) {
      return false;
    }
    last = normalized;
    onChange(normalized);
    return true;
  }

  return {
    update,
    /** @returns {SafeAreaInsets | null} */
    current: () => (last ? { ...last } : null),
  };
}

/**
 * Reads `[top, right, bottom, left]` safe-area CSS pixels from the single
 * hidden probe element.
 *
 * @param {Window} win
 * @param {HTMLElement} probe
 * @returns {SafeAreaInsets}
 */
export function readSafeAreaProbe(win, probe) {
  const computed = win.getComputedStyle(probe);
  return {
    top: parseCssPx(computed.getPropertyValue('padding-top')),
    right: parseCssPx(computed.getPropertyValue('padding-right')),
    bottom: parseCssPx(computed.getPropertyValue('padding-bottom')),
    left: parseCssPx(computed.getPropertyValue('padding-left')),
  };
}

/**
 * Attaches listeners to the single `aria-hidden="true"` zero-size safe-area
 * probe and notifies `onChange` whenever any individual side changes.
 *
 * @param {Window} win
 * @param {HTMLElement} probe
 * @param {(insets: SafeAreaInsets) => void} onChange
 */
export function observeSafeAreaProbe(win, probe, onChange) {
  const tracker = createSafeAreaTracker(onChange);
  const sample = () => tracker.update(readSafeAreaProbe(win, probe));

  probe.addEventListener('transitionrun', sample);
  probe.addEventListener('transitionend', sample);
  win.addEventListener('resize', sample);
  win.addEventListener('orientationchange', sample);
  if (win.visualViewport) {
    win.visualViewport.addEventListener('resize', sample);
    win.visualViewport.addEventListener('scroll', sample);
  }

  sample();

  return {
    sample,
    dispose() {
      probe.removeEventListener('transitionrun', sample);
      probe.removeEventListener('transitionend', sample);
      win.removeEventListener('resize', sample);
      win.removeEventListener('orientationchange', sample);
      if (win.visualViewport) {
        win.visualViewport.removeEventListener('resize', sample);
        win.visualViewport.removeEventListener('scroll', sample);
      }
    },
  };
}

/**
 * Focuses `#ime` synchronously inside the user gesture call stack so iOS
 * Safari and Android Chrome raise the software keyboard without auto-zoom.
 *
 * @param {HTMLTextAreaElement} imeEl
 * @param {{ inputMode?: string, enterKeyHint?: string }} [options]
 * @returns {boolean}
 */
export function focusImeInGesture(imeEl, options = {}) {
  if (!imeEl) {
    return false;
  }
  if (imeEl.style) {
    imeEl.style.fontSize = '16px';
  }
  if (options.inputMode) {
    imeEl.inputMode = options.inputMode;
  }
  if (options.enterKeyHint) {
    imeEl.enterKeyHint = options.enterKeyHint;
  }
  imeEl.readOnly = false;
  imeEl.focus({ preventScroll: true });
  return true;
}

/**
 * Filters user HTML embed sandbox tokens through a strict allowlist
 * (`allow-scripts`, `allow-forms`, `allow-popups`), defaulting to
 * `allow-scripts` and unconditionally blocking `allow-same-origin` and
 * `allow-top-navigation`.
 *
 * @param {string | undefined} rawSandbox
 * @returns {string}
 */
export function sanitizeEmbedSandbox(rawSandbox) {
  const requested = rawSandbox ? rawSandbox.split(/\s+/) : ['allow-scripts'];
  const allowed = requested
    .map(token => token.trim().toLowerCase())
    .filter(token => ALLOWED_SANDBOX_TOKENS.has(token));
  return [...new Set(allowed)].join(' ');
}

/**
 * Validates that an embed iframe URL matches `index.html` CSP `frame-src`
 * (`blob:` or `about:blank` only).
 *
 * @param {string} rawSrc
 * @returns {string}
 */
export function validateEmbedSrc(rawSrc) {
  const trimmed = String(rawSrc || '').trim();
  if (!trimmed) {
    throw new Error('Embed iframe src must be a non-empty URL');
  }
  if (trimmed.toLowerCase() === 'about:blank') {
    return 'about:blank';
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid embed iframe URL: ${trimmed}`);
  }
  if (parsed.protocol !== 'blob:') {
    throw new Error(`Disallowed embed iframe protocol: ${parsed.protocol}`);
  }
  return trimmed;
}

/**
 * Mounts a sandboxed user HTML iframe inside `#embed-layer` with strict
 * sandbox token allowlisting and `blob:`/`about:blank`-only URL validation.
 *
 * @param {Document} doc
 * @param {HTMLElement} embedLayer
 * @param {{ src: string, title?: string, sandbox?: string }} options
 * @returns {HTMLIFrameElement}
 */
export function createSandboxedEmbedIframe(doc, embedLayer, options) {
  const safeSrc = validateEmbedSrc(options.src);
  const iframe = doc.createElement('iframe');
  iframe.setAttribute('sandbox', sanitizeEmbedSandbox(options.sandbox));
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.setAttribute('title', options.title || 'Embedded content');
  iframe.src = safeSrc;
  embedLayer.append(iframe);
  return iframe;
}

/**
 * CRDT flush barrier executed before navigating away to login or legacy shell.
 * Pauses input synchronously, awaits local persistence, and aborts navigation
 * if persistence fails so pending local writes are never discarded.
 *
 * @param {FlushNavigationOptions} options
 * @returns {Promise<{ navigated: boolean, reason?: string }>}
 */
export async function flushBeforeNavigation(options) {
  options.pauseInput();
  try {
    const result = await options.flushPendingWrites();
    const ok =
      typeof result === 'boolean'
        ? result
        : Boolean(
            result &&
            result.ok &&
            (result.pendingCount === undefined || result.pendingCount === 0)
          );
    if (!ok) {
      options.resumeInput?.();
      return { navigated: false, reason: 'flush-rejected' };
    }
  } catch (error) {
    options.resumeInput?.();
    const message = error instanceof Error ? error.message : String(error);
    return { navigated: false, reason: `flush-error:${message}` };
  }
  options.navigate(options.targetUrl);
  return { navigated: true };
}

/**
 * Removes `#boot` once the first canvas frame is ready and deduplicates any
 * pre-mounted `#app-canvas` or `#ime` if the Wasm UI platform mounted its own.
 *
 * @param {Document} doc
 */
export function removeBootSkeleton(doc) {
  const boot = doc.getElementById('boot');
  if (boot) {
    boot.remove();
  }
  if (typeof doc.querySelectorAll === 'function') {
    const canvases = doc.querySelectorAll('canvas');
    if (canvases.length > 1) {
      const hostCanvas = doc.getElementById('app-canvas');
      if (hostCanvas) {
        hostCanvas.remove();
      }
    }
    const textareas = doc.querySelectorAll('textarea');
    if (textareas.length > 1) {
      const hostIme = doc.getElementById('ime');
      if (hostIme) {
        hostIme.remove();
      }
    }
  }
}

/**
 * Creates a deterministic graphics context recovery and legacy-fallback
 * controller for `#app-canvas` WebGL2 and WebGPU devices.
 *
 * @param {Object} options
 * @param {() => string} options.getHref
 * @param {() => boolean} options.isOAuthCodeConsumed
 * @param {() => HTMLCanvasElement | null} [options.getActiveCanvas]
 * @param {() => void} options.pauseInput
 * @param {() => void} options.resumeInput
 * @param {() => void} [options.freezeFrameLoop]
 * @param {() => void} [options.unfreezeFrameLoop]
 * @param {() => Promise<boolean | { ok: boolean, pendingCount?: number }>} options.flushPendingWrites
 * @param {(url: string) => void} options.navigate
 * @param {(message: string, opts?: { retryable?: boolean }) => void} [options.showFatal]
 * @param {() => void} [options.hideFatal]
 * @param {() => boolean} [options.isDocumentHidden]
 * @param {(canvas: HTMLCanvasElement | null) => boolean | Promise<boolean>} [options.onContextRestored]
 * @param {(info: unknown) => boolean | Promise<boolean>} [options.tryWebGl2Fallback]
 * @param {number} [options.restoreTimeoutMs=4000]
 * @param {number} [options.maxContextLosses=3]
 * @param {number} [options.lossWindowMs=30000]
 * @param {() => number} [options.now]
 * @param {(fn: () => void, ms: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 */
export function createGpuRecoveryController(options) {
  const restoreTimeoutMs = Math.max(1, options.restoreTimeoutMs ?? 4000);
  const maxContextLosses = Math.max(1, options.maxContextLosses ?? 3);
  const lossWindowMs = Math.max(1, options.lossWindowMs ?? 30_000);
  const now = options.now || (() => Date.now());
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer || (handle => clearTimeout(/** @type {any} */ (handle)));

  /** @type {'ready' | 'context-lost' | 'fallback-pending' | 'fallback-blocked' | 'fallback-navigated' | 'fatal'} */
  let status = 'ready';
  let inputPaused = false;
  let frameLoopFrozen = false;
  let totalLossCount = 0;
  let restoreCount = 0;
  let recoveryEpoch = 0;
  /** @type {number[]} */
  let lossTimestamps = [];
  /** @type {unknown} */
  let restoreTimer = null;
  let restoreTimerPausedByVisibility = false;
  /** @type {Promise<{ navigated: boolean, retryable?: boolean, reason?: string }> | null} */
  let fallbackInFlight = null;
  /** @type {string | null} */
  let lastError = null;
  /** @type {string | null} */
  let lastFallbackReason = null;
  /** @type {string | null} */
  let pendingFallbackUrl = null;
  /** @type {((canvas: HTMLCanvasElement | null) => boolean | Promise<boolean>) | null} */
  let onContextRestoredHook = options.onContextRestored || null;
  /** @type {((info: unknown) => boolean | Promise<boolean>) | null} */
  let tryWebGl2FallbackHook = options.tryWebGl2Fallback || null;

  function clearRestoreTimer() {
    restoreTimerPausedByVisibility = false;
    if (restoreTimer !== null) {
      clearTimer(restoreTimer);
      restoreTimer = null;
    }
  }

  function scheduleRestoreTimeout() {
    clearRestoreTimer();
    if (options.isDocumentHidden?.()) {
      restoreTimerPausedByVisibility = true;
      return;
    }
    restoreTimer = setTimer(() => {
      restoreTimer = null;
      void triggerFallback('context-restore-timeout');
    }, restoreTimeoutMs);
  }

  function pauseAll() {
    if (!inputPaused) {
      inputPaused = true;
      options.pauseInput();
    }
    if (!frameLoopFrozen) {
      frameLoopFrozen = true;
      options.freezeFrameLoop?.();
    }
  }

  function resumeAll() {
    if (frameLoopFrozen) {
      frameLoopFrozen = false;
      options.unfreezeFrameLoop?.();
    }
    if (inputPaused) {
      inputPaused = false;
      options.resumeInput();
    }
  }

  /**
   * Flushes pending IndexedDB writes and navigates to `?shell=legacy` only
   * after persistence succeeds. Single-flight mutex prevents overlapping
   * flushes or duplicate navigations. Aborts navigation and exposes a
   * retryable error state if persistence fails.
   *
   * @param {string} [reason='runtime-gpu-loss']
   * @returns {Promise<{ navigated: boolean, retryable?: boolean, reason?: string }>}
   */
  function triggerFallback(reason = 'runtime-gpu-loss') {
    if (fallbackInFlight) {
      return fallbackInFlight;
    }
    if (status === 'fallback-navigated' || status === 'fatal') {
      return Promise.resolve({
        navigated: false,
        retryable: false,
        reason: status,
      });
    }

    clearRestoreTimer();
    pauseAll();
    recoveryEpoch += 1;
    lastFallbackReason = reason;

    if (isLegacyShellUrl(options.getHref())) {
      status = 'fatal';
      lastError = 'already-legacy';
      options.showFatal?.('Graphics context was lost.', { retryable: false });
      return Promise.resolve({
        navigated: false,
        retryable: false,
        reason: 'already-legacy',
      });
    }

    const fallback = buildLegacyFallbackUrl(options.getHref(), {
      codeConsumed: options.isOAuthCodeConsumed(),
    });
    status = 'fallback-pending';
    pendingFallbackUrl = fallback.url;

    const run = (async () => {
      try {
        const result = await flushBeforeNavigation({
          pauseInput: () => pauseAll(),
          flushPendingWrites: options.flushPendingWrites,
          navigate: options.navigate,
          targetUrl: fallback.url,
        });

        if (result.navigated) {
          status = 'fallback-navigated';
          lastError = null;
          pendingFallbackUrl = null;
          return { navigated: true };
        }

        status = 'fallback-blocked';
        lastError = result.reason || 'flush-rejected';
        options.showFatal?.(
          'Unable to save pending edits. Tap Retry to try again.',
          { retryable: true }
        );
        return {
          navigated: false,
          retryable: true,
          reason: lastError,
        };
      } finally {
        fallbackInFlight = null;
      }
    })();

    fallbackInFlight = run;
    return run;
  }

  /**
   * Handles `#app-canvas` `webglcontextlost`. Calls `preventDefault()`, pauses
   * input, freezes the frame loop, and starts the visibility-aware restore
   * timeout. Ignores duplicate losses once fallback is pending or terminal.
   *
   * @param {Event | null | undefined} event
   * @returns {{ tripped: boolean, lossCountInWindow: number }}
   */
  function handleWebGlContextLost(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (
      fallbackInFlight !== null ||
      status === 'fallback-pending' ||
      status === 'fallback-navigated' ||
      status === 'fatal'
    ) {
      return { tripped: false, lossCountInWindow: lossTimestamps.length };
    }

    pauseAll();
    recoveryEpoch += 1;
    const t = now();
    totalLossCount += 1;
    lossTimestamps = lossTimestamps.filter(ts => t - ts <= lossWindowMs);
    lossTimestamps.push(t);

    if (lossTimestamps.length >= maxContextLosses) {
      void triggerFallback('context-loss-threshold');
      return { tripped: true, lossCountInWindow: lossTimestamps.length };
    }

    status = 'context-lost';
    scheduleRestoreTimeout();

    return { tripped: false, lossCountInWindow: lossTimestamps.length };
  }

  /**
   * Pauses or resumes the restore timeout when page visibility changes.
   *
   * @param {boolean} hidden
   */
  function handleVisibilityChange(hidden) {
    if (status !== 'context-lost') {
      return;
    }
    if (hidden) {
      if (restoreTimer !== null) {
        clearTimer(restoreTimer);
        restoreTimer = null;
      }
      restoreTimerPausedByVisibility = true;
    } else if (restoreTimerPausedByVisibility) {
      scheduleRestoreTimeout();
    }
  }

  /**
   * Handles `#app-canvas` `webglcontextrestored`. Rebuilds render targets and
   * redraws immediately, then resumes the frame loop and input delivery.
   * Strictly blocked once fallback is pending, navigated, or fatal, or when a
   * newer loss epoch superseded this async restore.
   *
   * @returns {Promise<{ recovered: boolean, reason?: string }>}
   */
  async function handleWebGlContextRestored() {
    clearRestoreTimer();
    if (
      fallbackInFlight !== null ||
      status === 'fallback-pending' ||
      status === 'fallback-navigated' ||
      status === 'fatal'
    ) {
      return { recovered: false, reason: status };
    }
    const epoch = recoveryEpoch;
    try {
      const rebuilt = onContextRestoredHook
        ? await onContextRestoredHook(options.getActiveCanvas?.() ?? null)
        : true;
      if (
        epoch !== recoveryEpoch ||
        fallbackInFlight !== null ||
        status === 'fallback-pending' ||
        status === 'fallback-navigated' ||
        status === 'fatal'
      ) {
        return { recovered: false, reason: status };
      }
      if (!rebuilt) {
        await triggerFallback('context-restore-failed');
        return { recovered: false, reason: 'context-restore-failed' };
      }
      restoreCount += 1;
      status = 'ready';
      lastError = null;
      pendingFallbackUrl = null;
      options.hideFatal?.();
      resumeAll();
      return { recovered: true };
    } catch {
      if (
        epoch !== recoveryEpoch ||
        fallbackInFlight !== null ||
        status === 'fallback-pending' ||
        status === 'fallback-navigated' ||
        status === 'fatal'
      ) {
        return { recovered: false, reason: status };
      }
      await triggerFallback('context-restore-failed');
      return { recovered: false, reason: 'context-restore-failed' };
    }
  }

  /**
   * Handles WebGPU `device.lost`. Tries WebGL2 downgrade when a fallback hook
   * is provided; triggers the IDB-flushed legacy circuit breaker otherwise.
   *
   * @param {unknown} info
   * @param {{ tryWebGl2Fallback?: (info: unknown) => boolean | Promise<boolean> }} [override]
   * @returns {Promise<{ recovered: boolean, mode?: string, navigated?: boolean, retryable?: boolean, reason?: string }>}
   */
  async function handleWebGpuDeviceLost(info, override = {}) {
    if (
      fallbackInFlight !== null ||
      status === 'fallback-pending' ||
      status === 'fallback-navigated' ||
      status === 'fatal'
    ) {
      if (fallbackInFlight) {
        const res = await fallbackInFlight;
        return { recovered: false, ...res };
      }
      return { recovered: false, navigated: false, reason: status };
    }
    clearRestoreTimer();
    pauseAll();
    recoveryEpoch += 1;
    const epoch = recoveryEpoch;
    const fallbackFn = override.tryWebGl2Fallback || tryWebGl2FallbackHook;
    if (typeof fallbackFn === 'function') {
      try {
        const ok = await fallbackFn(info);
        if (
          epoch !== recoveryEpoch ||
          fallbackInFlight !== null ||
          status === 'fallback-pending' ||
          status === 'fallback-navigated' ||
          status === 'fatal'
        ) {
          return { recovered: false, navigated: false, reason: status };
        }
        if (ok) {
          restoreCount += 1;
          status = 'ready';
          lastError = null;
          pendingFallbackUrl = null;
          options.hideFatal?.();
          resumeAll();
          return { recovered: true, mode: 'webgl2' };
        }
      } catch {
        if (
          epoch !== recoveryEpoch ||
          fallbackInFlight !== null ||
          status === 'fallback-pending' ||
          status === 'fallback-navigated' ||
          status === 'fatal'
        ) {
          return { recovered: false, navigated: false, reason: status };
        }
        // Fall through to unrecoverable circuit breaker.
      }
    }
    const res = await triggerFallback('webgpu-device-lost');
    return { recovered: false, ...res };
  }

  /**
   * Retries a blocked legacy fallback after an IndexedDB flush error.
   * Only starts a new single-flight flush when currently `fallback-blocked`.
   */
  function retryFallback() {
    if (fallbackInFlight) {
      return fallbackInFlight;
    }
    if (status !== 'fallback-blocked') {
      return Promise.resolve({
        navigated: false,
        retryable: false,
        reason: status,
      });
    }
    return triggerFallback(lastFallbackReason || 'retry-fallback');
  }

  /**
   * Updates recovery hooks after app entry boot.
   *
   * @param {{ onContextRestored?: (canvas: HTMLCanvasElement | null) => boolean | Promise<boolean>, tryWebGl2Fallback?: (info: unknown) => boolean | Promise<boolean> }} hooks
   */
  function setHooks(hooks) {
    if (hooks.onContextRestored !== undefined) {
      onContextRestoredHook = hooks.onContextRestored;
    }
    if (hooks.tryWebGl2Fallback !== undefined) {
      tryWebGl2FallbackHook = hooks.tryWebGl2Fallback;
    }
  }

  function dispose() {
    clearRestoreTimer();
  }

  return {
    handleWebGlContextLost,
    handleWebGlContextRestored,
    handleWebGpuDeviceLost,
    handleVisibilityChange,
    triggerFallback,
    retryFallback,
    setHooks,
    dispose,
    getState: () => ({
      status,
      inputPaused,
      frameLoopFrozen,
      totalLossCount,
      restoreCount,
      lossCountInWindow: lossTimestamps.length,
      retryable: status === 'fallback-blocked',
      lastError,
      lastFallbackReason,
      pendingFallbackUrl,
    }),
  };
}

/**
 * Displays a fatal or retryable error overlay inside `#boot`.
 * Recreates `#boot` on `doc.body` if the boot skeleton was already removed
 * after the first canvas frame, keeping zero extra DOM during normal steady
 * state.
 *
 * @param {Document} doc
 * @param {string} message
 * @param {{ retryable?: boolean, onRetry?: () => void }} [options]
 */
export function showBootFatal(doc, message, options = {}) {
  let boot = doc.getElementById('boot');
  let msgEl = doc.getElementById('boot-message');

  if (!boot && doc.body && typeof doc.createElement === 'function') {
    boot = doc.createElement('div');
    boot.id = 'boot';
    boot.setAttribute?.('role', 'alert');
    boot.setAttribute?.('aria-live', 'assertive');
    if (boot.style) {
      boot.style.position = 'fixed';
      boot.style.inset = '0';
      boot.style.zIndex = '20';
      boot.style.display = 'flex';
      boot.style.flexDirection = 'column';
      boot.style.alignItems = 'center';
      boot.style.justifyContent = 'center';
      boot.style.gap = '12px';
      boot.style.padding = '24px';
      boot.style.background = 'rgba(20, 20, 24, 0.92)';
      boot.style.color = '#ffffff';
    }
    msgEl = doc.createElement('div');
    msgEl.id = 'boot-message';
    if (msgEl.style) {
      msgEl.style.fontSize = '15px';
      msgEl.style.lineHeight = '1.5';
      msgEl.style.textAlign = 'center';
      msgEl.style.maxWidth = '320px';
    }
    boot.append?.(msgEl);
    doc.body.append?.(boot);
  }

  if (!boot) {
    return;
  }
  if (boot.dataset) {
    boot.dataset.state = 'fatal';
  }
  if (msgEl) {
    msgEl.textContent = message;
  }

  let retryBtn = doc.getElementById('gpu-fallback-retry');
  if (options.retryable) {
    if (!retryBtn && typeof doc.createElement === 'function') {
      retryBtn = doc.createElement('button');
      retryBtn.id = 'gpu-fallback-retry';
      retryBtn.setAttribute?.('type', 'button');
      retryBtn.textContent = 'Retry';
      if (retryBtn.style) {
        retryBtn.style.padding = '10px 20px';
        retryBtn.style.borderRadius = '8px';
        retryBtn.style.border = '0';
        retryBtn.style.background = '#1e6efb';
        retryBtn.style.color = '#ffffff';
        retryBtn.style.fontSize = '14px';
        retryBtn.style.fontWeight = '600';
        retryBtn.style.cursor = 'pointer';
      }
      boot.append?.(retryBtn);
    }
    if (retryBtn && options.onRetry) {
      const btn = /** @type {HTMLButtonElement} */ (retryBtn);
      btn.disabled = false;
      btn.onclick = () => {
        btn.disabled = true;
        void Promise.resolve(options.onRetry?.()).finally(() => {
          btn.disabled = false;
        });
      };
    }
  } else if (retryBtn) {
    retryBtn.remove?.();
  }
}

/**
 * Removes any runtime `#boot` error banner once recovery or navigation settles.
 *
 * @param {Document} doc
 */
export function hideRuntimeFatal(doc) {
  const boot = doc.getElementById('boot');
  if (boot) {
    boot.remove?.();
  }
}

/**
 * Initializes the Web Mobile thin host in a browser document.
 *
 * @param {Object} [env]
 * @param {Window} [env.win]
 * @param {Document} [env.doc]
 * @param {() => Promise<boolean | { ok: boolean }>} [env.flushPendingWrites]
 * @param {(insets: SafeAreaInsets) => void} [env.onSafeAreaChange]
 * @param {(specifier: string) => Promise<unknown>} [env.importModule]
 * @param {{ flavour: string, type: 'workspace' | 'userspace', id: string }} [env.space]
 * @param {IDBFactory} [env.indexedDB]
 * @param {typeof BroadcastChannel} [env.BroadcastChannelImpl]
 * @param {ReturnType<typeof createIdbWorkspaceStorage>} [env.workspaceStorage]
 * @param {() => number} [env.now]
 * @param {(fn: () => void, ms: number) => unknown} [env.setTimer]
 * @param {(handle: unknown) => void} [env.clearTimer]
 * @param {number} [env.restoreTimeoutMs]
 * @param {number} [env.maxContextLosses]
 * @param {number} [env.lossWindowMs]
 * @param {() => void} [env.onFreezeFrameLoop]
 * @param {() => void} [env.onUnfreezeFrameLoop]
 * @param {(canvas: HTMLCanvasElement | null) => boolean | Promise<boolean>} [env.onContextRestored]
 * @param {(info: unknown) => boolean | Promise<boolean>} [env.tryWebGl2Fallback]
 * @param {string | null} [env.assetBaseUrl]
 * @param {string} [env.buildId]
 * @param {number} [env.pdfCacheMaxBytes]
 */
export async function bootWebHost(env = {}) {
  const win = env.win || globalThis.window;
  const doc = env.doc || globalThis.document;
  if (!win || !doc) {
    return null;
  }

  const canvas = /** @type {HTMLCanvasElement | null} */ (
    doc.getElementById('app-canvas')
  );
  const ime = /** @type {HTMLTextAreaElement | null} */ (
    doc.getElementById('ime')
  );
  const probe = doc.getElementById('safe-area-probe');
  const embedLayer = doc.getElementById('embed-layer');
  const a11yRoot = doc.getElementById('a11y-tree');

  let workspaceStorage =
    env.workspaceStorage ||
    (env.space
      ? createIdbWorkspaceStorage({
          ...env.space,
          indexedDB: env.indexedDB || win.indexedDB,
          BroadcastChannelImpl:
            env.BroadcastChannelImpl || win.BroadcastChannel,
          now: env.now,
        })
      : null);
  let pendingWrites = workspaceStorage
    ? createPendingWriteFlusher(workspaceStorage)
    : null;
  let v1Reader = env.space
    ? createIdbV1ReadonlyReader({
        workspaceId: env.space.id,
        indexedDB: env.indexedDB || win.indexedDB,
      })
    : null;
  const resolveFlush = () => {
    if (env.flushPendingWrites) {
      return env.flushPendingWrites();
    }
    if (pendingWrites) {
      return pendingWrites.flush();
    }
    return Promise.resolve({
      ok: true,
      unbound: true,
      flushedCount: 0,
      pendingCount: 0,
    });
  };

  const graphics = detectGraphicsSupport(doc, win.navigator);
  if (!graphics.supported) {
    if (isLegacyShellUrl(win.location.href)) {
      showBootFatal(doc, 'WebGPU and WebGL2 are unavailable in this browser.');
      return { fallback: false, fatal: true, graphics };
    }
    const fallback = buildLegacyFallbackUrl(win.location.href, {
      codeConsumed: false,
    });
    showBootFatal(doc, 'WebGPU and WebGL2 are unavailable. Switching shell...');
    await flushBeforeNavigation({
      pauseInput() {
        if (ime) {
          ime.readOnly = true;
        }
      },
      flushPendingWrites: resolveFlush,
      navigate: url => win.location.assign(url),
      targetUrl: fallback.url,
      resumeInput() {
        if (ime) {
          ime.readOnly = false;
        }
      },
    });
    return { fallback: true, fatal: false, graphics };
  }

  const manifest = readEmbeddedManifest(doc);
  const workerLoader = createWorkerLoader(manifest, {
    baseUrl: win.location.href,
    assetBaseUrl: env.assetBaseUrl,
    buildId: env.buildId,
  });
  const pdfClient = createPdfPreviewClient({
    workerLoader,
    maxCacheBytes: env.pdfCacheMaxBytes,
  });

  const safeAreaObserver = probe
    ? observeSafeAreaProbe(
        win,
        probe,
        env.onSafeAreaChange || (() => undefined)
      )
    : null;

  const a11yTree = a11yRoot
    ? createA11yTree({
        doc,
        root: a11yRoot,
        ime,
        embedLayer,
      })
    : null;

  let selectionOverlayActive = false;
  const imeSelectionGuard = ime
    ? attachImeSelectionGuard(ime, () => selectionOverlayActive)
    : null;

  let oauthCodeConsumed = false;
  let inputPaused = false;
  /** @type {HTMLCanvasElement | null} */
  let boundCanvas = null;

  /** @param {Event} event */
  function blockPausedCanvasInput(event) {
    if (!inputPaused) {
      return;
    }
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }

  /** @param {string} targetUrl */
  async function navigateWithFlush(targetUrl) {
    return flushBeforeNavigation({
      pauseInput() {
        inputPaused = true;
        if (ime) {
          ime.readOnly = true;
        }
      },
      flushPendingWrites: resolveFlush,
      navigate: url => win.location.assign(url),
      targetUrl,
      resumeInput() {
        inputPaused = false;
        if (ime) {
          ime.readOnly = false;
        }
      },
    });
  }

  const gpuRecovery = createGpuRecoveryController({
    getHref: () => win.location.href,
    isOAuthCodeConsumed: () => oauthCodeConsumed,
    getActiveCanvas: () => boundCanvas,
    isDocumentHidden: () => doc.visibilityState === 'hidden',
    pauseInput() {
      inputPaused = true;
      if (ime) {
        ime.readOnly = true;
      }
    },
    resumeInput() {
      inputPaused = false;
      if (ime) {
        ime.readOnly = false;
      }
    },
    freezeFrameLoop: env.onFreezeFrameLoop,
    unfreezeFrameLoop: env.onUnfreezeFrameLoop,
    flushPendingWrites: resolveFlush,
    navigate: url => win.location.assign(url),
    showFatal: (message, opts) =>
      showBootFatal(doc, message, {
        retryable: Boolean(opts?.retryable),
        onRetry: opts?.retryable
          ? () => gpuRecovery.retryFallback()
          : undefined,
      }),
    hideFatal: () => hideRuntimeFatal(doc),
    onContextRestored: env.onContextRestored,
    tryWebGl2Fallback: env.tryWebGl2Fallback,
    restoreTimeoutMs: env.restoreTimeoutMs,
    maxContextLosses: env.maxContextLosses,
    lossWindowMs: env.lossWindowMs,
    now: env.now,
    setTimer: env.setTimer,
    clearTimer: env.clearTimer,
  });

  function onVisibilityChange() {
    gpuRecovery.handleVisibilityChange(doc.visibilityState === 'hidden');
  }
  doc.addEventListener?.('visibilitychange', onVisibilityChange);

  async function handleRuntimeGpuLoss() {
    return gpuRecovery.triggerFallback('runtime-gpu-loss');
  }

  /** @param {Event} event */
  function onContextLost(event) {
    gpuRecovery.handleWebGlContextLost(event);
  }

  function onContextRestored() {
    void gpuRecovery.handleWebGlContextRestored();
  }

  /** @param {HTMLCanvasElement | null} activeCanvas */
  function bindCanvas(activeCanvas) {
    if (boundCanvas === activeCanvas) {
      return;
    }
    if (boundCanvas && typeof boundCanvas.removeEventListener === 'function') {
      boundCanvas.removeEventListener('webglcontextlost', onContextLost);
      boundCanvas.removeEventListener(
        'webglcontextrestored',
        onContextRestored
      );
      boundCanvas.removeEventListener(
        'pointerdown',
        blockPausedCanvasInput,
        true
      );
      boundCanvas.removeEventListener(
        'pointermove',
        blockPausedCanvasInput,
        true
      );
      boundCanvas.removeEventListener(
        'pointerup',
        blockPausedCanvasInput,
        true
      );
    }
    boundCanvas = activeCanvas || null;
    if (boundCanvas && typeof boundCanvas.addEventListener === 'function') {
      boundCanvas.addEventListener('webglcontextlost', onContextLost);
      boundCanvas.addEventListener('webglcontextrestored', onContextRestored);
      boundCanvas.addEventListener('pointerdown', blockPausedCanvasInput, true);
      boundCanvas.addEventListener('pointermove', blockPausedCanvasInput, true);
      boundCanvas.addEventListener('pointerup', blockPausedCanvasInput, true);
    }
  }

  /**
   * @param {{ lost?: Promise<unknown> } | null | undefined} device
   * @param {{ tryWebGl2Fallback?: (info: unknown) => boolean | Promise<boolean> }} [deviceOpts]
   */
  function bindWebGpuDevice(device, deviceOpts = {}) {
    if (device && device.lost && typeof device.lost.then === 'function') {
      void device.lost.then(info => {
        void gpuRecovery.handleWebGpuDeviceLost(info, deviceOpts);
      });
    }
  }

  const BroadcastChannelCtor = env.BroadcastChannelImpl || win.BroadcastChannel;
  const localWorkspaceChannel =
    typeof BroadcastChannelCtor === 'function'
      ? new BroadcastChannelCtor(LOCAL_WORKSPACE_CHANGED_CHANNEL)
      : null;
  /** @type {Set<(ids: string[], changedId: string | null) => void>} */
  const localWorkspaceListeners = new Set();
  /** @param {MessageEvent} event */
  function handleLocalWorkspaceChanged(event) {
    const ids = getLocalWorkspaceIds(safeGetLocalStorage(win));
    const changedId = typeof event?.data === 'string' ? event.data : null;
    for (const listener of localWorkspaceListeners) {
      listener(ids, changedId);
    }
  }
  localWorkspaceChannel?.addEventListener(
    'message',
    handleLocalWorkspaceChanged
  );

  bindCanvas(canvas);

  const hostHandle = {
    fallback: false,
    fatal: false,
    graphics,
    get canvas() {
      return boundCanvas || canvas;
    },
    ime,
    embedLayer,
    a11yTree,
    isInputPaused: () => inputPaused,
    get workspaceStorage() {
      return workspaceStorage;
    },
    get pendingWrites() {
      return pendingWrites;
    },
    get v1Reader() {
      return v1Reader;
    },
    get workspaceBound() {
      return Boolean(workspaceStorage);
    },
    attachWorkspace: space => {
      if (pendingWrites && pendingWrites.pendingCount() > 0) {
        throw new Error(
          'Cannot switch workspace while pending writes are unflushed; flush pendingWrites first'
        );
      }
      const normalized = {
        flavour: space.flavour || space.peer || 'local',
        type: space.type || space.spaceType || 'workspace',
        id: space.id || space.spaceId,
      };
      workspaceStorage?.close();
      workspaceStorage = createIdbWorkspaceStorage({
        ...normalized,
        indexedDB: env.indexedDB || win.indexedDB,
        BroadcastChannelImpl: env.BroadcastChannelImpl || win.BroadcastChannel,
        now: env.now,
      });
      pendingWrites = createPendingWriteFlusher(workspaceStorage);
      v1Reader = createIdbV1ReadonlyReader({
        workspaceId: normalized.id,
        indexedDB: env.indexedDB || win.indexedDB,
      });
      return { workspaceStorage, pendingWrites, v1Reader };
    },
    switchWorkspace: async space => {
      if (pendingWrites && pendingWrites.pendingCount() > 0) {
        const flushResult = await pendingWrites.flush();
        if (!flushResult.ok) {
          throw new Error(
            flushResult.error ||
              'Failed to flush pending writes before switching workspace'
          );
        }
      }
      const normalized = {
        flavour: space.flavour || space.peer || 'local',
        type: space.type || space.spaceType || 'workspace',
        id: space.id || space.spaceId,
      };
      workspaceStorage?.close();
      workspaceStorage = createIdbWorkspaceStorage({
        ...normalized,
        indexedDB: env.indexedDB || win.indexedDB,
        BroadcastChannelImpl: env.BroadcastChannelImpl || win.BroadcastChannel,
        now: env.now,
      });
      pendingWrites = createPendingWriteFlusher(workspaceStorage);
      v1Reader = createIdbV1ReadonlyReader({
        workspaceId: normalized.id,
        indexedDB: env.indexedDB || win.indexedDB,
      });
      return { workspaceStorage, pendingWrites, v1Reader };
    },
    workerLoader,
    pdfClient,
    gpuRecovery,
    safeAreaObserver,
    navigateWithFlush,
    handleRuntimeGpuLoss,
    retryGpuFallback: () => gpuRecovery.retryFallback(),
    setGraphicsRecoveryHooks: hooks => gpuRecovery.setHooks(hooks),
    setSelectionOverlayActive: active => {
      selectionOverlayActive = Boolean(active);
    },
    executeClipboardAction: params =>
      executeClipboardAction({
        ...params,
        clipboard: params.clipboard ?? win.navigator?.clipboard ?? null,
        isSecureContext: params.isSecureContext ?? win.isSecureContext ?? true,
        imeEl: ime,
        doc,
      }),
    markOAuthCodeConsumed: () => {
      oauthCodeConsumed = true;
    },
    bindCanvas,
    bindWebGpuDevice,
    focusImeInGesture: options => {
      if (!ime) {
        return false;
      }
      a11yTree?.setFocusOwner('ime');
      return focusImeInGesture(ime, options);
    },
    mountSandboxedEmbed: options => {
      if (!embedLayer) {
        return null;
      }
      const iframe = createSandboxedEmbedIframe(doc, embedLayer, options);
      if (a11yTree && a11yTree.getFocusOwner() !== 'embed') {
        iframe.setAttribute('tabindex', '-1');
      }
      /** @type {'none' | 'a11y' | 'ime' | 'embed'} */
      let previousOwner = 'a11y';
      let activating = false;
      const activate = (fromFocusEvent = false) => {
        if (activating || !a11yTree) {
          return;
        }
        activating = true;
        try {
          const current = a11yTree.getFocusOwner();
          if (current !== 'embed') {
            previousOwner = current;
          }
          a11yTree.setFocusOwner('embed');
          iframe.removeAttribute?.('tabindex');
          if (!fromFocusEvent) {
            iframe.focus?.();
          }
        } finally {
          activating = false;
        }
      };
      const onIframeFocus = () => activate(true);
      const unmount = () => {
        iframe.removeEventListener?.('focus', onIframeFocus);
        iframe.remove?.();
        if (a11yTree && a11yTree.getFocusOwner() === 'embed') {
          a11yTree.setFocusOwner(previousOwner);
        }
      };
      iframe.addEventListener?.('focus', onIframeFocus);
      return { iframe, activate: () => activate(false), unmount };
    },
    getLocalWorkspaceIds: () => getLocalWorkspaceIds(safeGetLocalStorage(win)),
    setLocalWorkspaceIds: (ids, changedId = null) =>
      setLocalWorkspaceIds(
        ids,
        win?.localStorage ?? null,
        localWorkspaceChannel,
        changedId
      ),
    subscribeLocalWorkspaceIds: listener => {
      localWorkspaceListeners.add(listener);
      return () => {
        localWorkspaceListeners.delete(listener);
      };
    },
    getWebPreference: key => getWebPreference(key, safeGetLocalStorage(win)),
    setWebPreference: (key, value) =>
      setWebPreference(key, value, win?.localStorage ?? null),
    getPreferredLocale: () => resolvePreferredLocale(win),
    markFirstFrameReady: () => removeBootSkeleton(doc),
    dispose: () => {
      doc.removeEventListener?.('visibilitychange', onVisibilityChange);
      localWorkspaceChannel?.removeEventListener(
        'message',
        handleLocalWorkspaceChanged
      );
      localWorkspaceChannel?.close();
      localWorkspaceListeners.clear();
      workspaceStorage?.close();
      safeAreaObserver?.dispose();
      imeSelectionGuard?.dispose();
      gpuRecovery.dispose();
      pdfClient.dispose();
      workerLoader.dispose();
      bindCanvas(null);
    },
  };

  /** @type {{ __AFFINE_WEB_HOST__?: unknown }} */ (
    /** @type {unknown} */ (win)
  ).__AFFINE_WEB_HOST__ = hostHandle;

  if (manifest.appEntryJs) {
    const entryUrl = new URL(
      manifest.appEntryJs,
      new URL('/', win.location.href)
    ).toString();
    const importer = env.importModule || (spec => import(spec));
    await importer(entryUrl);
  }

  return hostHandle;
}

/**
 * Safely reads `win.localStorage` without throwing when browser privacy settings
 * or sandboxed iframes reject the property getter with `SecurityError`.
 *
 * @param {{ localStorage?: Storage } | null | undefined} win
 * @returns {Storage | null}
 */
function safeGetLocalStorage(win) {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Decodes a stored language value from either 0.27.5 `GlobalCache`
 * (`JSON.stringify(lang)` under `global-cache:i18n_lng`) or a plain string
 * preference, treating `'system'`, malformed JSON, and empty/non-BCP-47
 * sentinels as unset.
 *
 * @param {string | null | undefined} raw
 * @returns {string}
 */
function decodeStoredLocale(raw) {
  if (typeof raw !== 'string') {
    return '';
  }
  let trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  if (
    trimmed.startsWith('"') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      trimmed = typeof parsed === 'string' ? parsed.trim() : '';
    } catch {
      return '';
    }
  } else if (trimmed === 'null' || trimmed === 'undefined') {
    return '';
  }
  if (!trimmed || trimmed.toLowerCase() === 'system') {
    return '';
  }
  if (!/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{1,8})*$/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

/**
 * Resolves the user's preferred locale from host `language` preference,
 * existing 0.27.5 `global-cache:i18n_lng`, or `navigator.language`.
 *
 * @param {{ localStorage?: Storage, navigator?: { language?: string } } | null | undefined} win
 * @returns {string}
 */
function resolvePreferredLocale(win) {
  const storage = safeGetLocalStorage(win);
  const hostPref = decodeStoredLocale(getWebPreference('language', storage));
  if (hostPref) {
    return hostPref;
  }
  const legacyGlobalCache = decodeStoredLocale(
    getWebPreference('global-cache:i18n_lng', storage)
  );
  if (legacyGlobalCache) {
    return legacyGlobalCache;
  }
  try {
    const navLang = win?.navigator?.language;
    return typeof navLang === 'string' ? navLang.trim() : '';
  } catch {
    return '';
  }
}

if (
  globalThis.window !== undefined &&
  globalThis.document !== undefined &&
  !globalThis.__AFFINE_WEB_HOST_TEST__
) {
  void bootWebHost();
}
