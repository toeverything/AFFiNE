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
 * Displays a fatal boot error inside `#boot`.
 *
 * @param {Document} doc
 * @param {string} message
 */
export function showBootFatal(doc, message) {
  const boot = doc.getElementById('boot');
  if (!boot) {
    return;
  }
  boot.dataset.state = 'fatal';
  const msgEl = doc.getElementById('boot-message');
  if (msgEl) {
    msgEl.textContent = message;
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

  let oauthCodeConsumed = false;
  /** @type {HTMLCanvasElement | null} */
  let boundCanvas = null;

  /** @param {string} targetUrl */
  async function navigateWithFlush(targetUrl) {
    return flushBeforeNavigation({
      pauseInput() {
        if (ime) {
          ime.readOnly = true;
        }
      },
      flushPendingWrites: resolveFlush,
      navigate: url => win.location.assign(url),
      targetUrl,
      resumeInput() {
        if (ime) {
          ime.readOnly = false;
        }
      },
    });
  }

  async function handleRuntimeGpuLoss() {
    if (isLegacyShellUrl(win.location.href)) {
      showBootFatal(doc, 'Graphics context was lost.');
      return { navigated: false, reason: 'already-legacy' };
    }
    const fallback = buildLegacyFallbackUrl(win.location.href, {
      codeConsumed: oauthCodeConsumed,
    });
    return navigateWithFlush(fallback.url);
  }

  /** @param {Event} event */
  function onContextLost(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    void handleRuntimeGpuLoss();
  }

  /** @param {HTMLCanvasElement | null} activeCanvas */
  function bindCanvas(activeCanvas) {
    if (boundCanvas === activeCanvas) {
      return;
    }
    if (boundCanvas && typeof boundCanvas.removeEventListener === 'function') {
      boundCanvas.removeEventListener('webglcontextlost', onContextLost);
    }
    boundCanvas = activeCanvas || null;
    if (boundCanvas && typeof boundCanvas.addEventListener === 'function') {
      boundCanvas.addEventListener('webglcontextlost', onContextLost);
    }
  }

  /** @param {{ lost?: Promise<unknown> } | null | undefined} device */
  function bindWebGpuDevice(device) {
    if (device && device.lost && typeof device.lost.then === 'function') {
      void device.lost.then(() => {
        void handleRuntimeGpuLoss();
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
    const ids = getLocalWorkspaceIds(win.localStorage);
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
    canvas,
    ime,
    embedLayer,
    a11yTree,
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
    safeAreaObserver,
    navigateWithFlush,
    handleRuntimeGpuLoss,
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
    getLocalWorkspaceIds: () => getLocalWorkspaceIds(win.localStorage),
    setLocalWorkspaceIds: (ids, changedId = null) =>
      setLocalWorkspaceIds(
        ids,
        win.localStorage,
        localWorkspaceChannel,
        changedId
      ),
    subscribeLocalWorkspaceIds: listener => {
      localWorkspaceListeners.add(listener);
      return () => {
        localWorkspaceListeners.delete(listener);
      };
    },
    getWebPreference: key => getWebPreference(key, win.localStorage),
    setWebPreference: (key, value) =>
      setWebPreference(key, value, win.localStorage),
    markFirstFrameReady: () => removeBootSkeleton(doc),
    dispose: () => {
      localWorkspaceChannel?.removeEventListener(
        'message',
        handleLocalWorkspaceChanged
      );
      localWorkspaceChannel?.close();
      localWorkspaceListeners.clear();
      workspaceStorage?.close();
      safeAreaObserver?.dispose();
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

if (
  globalThis.window !== undefined &&
  globalThis.document !== undefined &&
  !globalThis.__AFFINE_WEB_HOST_TEST__
) {
  void bootWebHost();
}
