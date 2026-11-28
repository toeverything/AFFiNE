// @ts-check

/**
 * @typedef {Object} WorkerAssetSpec
 * @property {string} script
 * @property {string} wasm
 */

/**
 * @typedef {'mermaid' | 'math' | 'typst' | 'pdf'} PreviewWorkerKind
 */

/**
 * @typedef {Object} BuildManifest
 * @property {string} shellVersion
 * @property {string} buildHash
 * @property {string} [buildId]
 * @property {string} [shell_build_id]
 * @property {string | null} [assetBaseUrl]
 * @property {string | null} [appEntryJs]
 * @property {string | null} [mainWasmJs]
 * @property {Record<PreviewWorkerKind, WorkerAssetSpec>} workers
 * @property {Record<string, string>} fonts
 */

/**
 * Freezes a build manifest deeply so cookie switches in another tab cannot
 * mutate asset resolution for this document.
 *
 * @param {BuildManifest} raw
 * @returns {Readonly<BuildManifest>}
 */
export function freezeBuildManifest(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('Build manifest must be an object');
  }
  const effectiveBuildId =
    (typeof raw.shell_build_id === 'string' && raw.shell_build_id) ||
    (typeof raw.buildId === 'string' && raw.buildId) ||
    (typeof raw.buildHash === 'string' && raw.buildHash) ||
    '';
  if (!effectiveBuildId) {
    throw new TypeError('Build manifest requires a non-empty buildHash');
  }
  /** @type {Record<string, Readonly<WorkerAssetSpec>>} */
  const frozenWorkers = {};
  for (const [key, spec] of Object.entries(raw.workers || {})) {
    if (
      !spec ||
      typeof spec.script !== 'string' ||
      typeof spec.wasm !== 'string'
    ) {
      throw new TypeError(
        `Worker manifest entry "${key}" requires script and wasm URLs`
      );
    }
    frozenWorkers[key] = Object.freeze({
      script: spec.script,
      wasm: spec.wasm,
    });
  }
  const workers = Object.freeze(frozenWorkers);
  const fonts = Object.freeze({ ...raw.fonts });
  const assetBaseUrl =
    typeof raw.assetBaseUrl === 'string' && raw.assetBaseUrl.trim()
      ? raw.assetBaseUrl.trim()
      : null;
  const mainWasmJs =
    typeof raw.mainWasmJs === 'string' && raw.mainWasmJs.trim()
      ? raw.mainWasmJs.trim()
      : null;
  return Object.freeze({
    shellVersion: String(raw.shellVersion || 'mobile-v1'),
    buildHash: effectiveBuildId,
    buildId: effectiveBuildId,
    shell_build_id: effectiveBuildId,
    assetBaseUrl,
    appEntryJs: typeof raw.appEntryJs === 'string' ? raw.appEntryJs : null,
    mainWasmJs,
    workers: /** @type {Record<PreviewWorkerKind, WorkerAssetSpec>} */ (
      workers
    ),
    fonts,
  });
}

/**
 * Reads the embedded read-only build manifest from the page DOM.
 *
 * @param {Document} doc
 * @param {string} [elementId='affine-build-manifest']
 * @returns {Readonly<BuildManifest>}
 */
export function readEmbeddedManifest(doc, elementId = 'affine-build-manifest') {
  const node = doc.getElementById(elementId);
  if (!node || !node.textContent) {
    throw new Error(`Missing build manifest element #${elementId}`);
  }
  return freezeBuildManifest(JSON.parse(node.textContent));
}

/**
 * Resolves a pinned asset URL against the locked asset root or site root so
 * nested routes and dual-tab shell cookie switches never cause 404 errors.
 *
 * @param {string} assetUrl
 * @param {string} baseUrl
 * @param {string} buildId
 * @param {string | null} [assetBaseUrl]
 * @returns {string}
 */
export function pinUrl(assetUrl, baseUrl, buildId, assetBaseUrl = null) {
  const siteRoot = new URL('/', baseUrl);
  let resolved;
  if (assetBaseUrl) {
    const normalizedRoot = assetBaseUrl.endsWith('/')
      ? assetBaseUrl
      : `${assetBaseUrl}/`;
    const lockedRoot = new URL(normalizedRoot, siteRoot);
    const alreadyPrefixed =
      assetUrl.startsWith(lockedRoot.pathname) ||
      assetUrl.startsWith(lockedRoot.href);
    if (alreadyPrefixed) {
      resolved = new URL(assetUrl, siteRoot);
    } else {
      const trimmed =
        assetUrl.startsWith('/') && !assetUrl.startsWith('//')
          ? assetUrl.slice(1)
          : assetUrl;
      resolved = new URL(trimmed, lockedRoot);
    }
  } else {
    resolved = new URL(assetUrl, siteRoot);
  }
  if (!resolved.pathname.includes(buildId)) {
    resolved.searchParams.set('v', buildId);
  }
  return resolved.toString();
}

/**
 * Builds the ES module bootstrap source for a preview Web Worker.
 *
 * @param {string} hostOrigin
 * @param {string} scriptUrl
 * @param {string} wasmUrl
 * @returns {string}
 */
export function buildWorkerBootstrapSource(hostOrigin, scriptUrl, wasmUrl) {
  return [
    `globalThis.AFFINE_HOST_ORIGIN = ${JSON.stringify(hostOrigin)};`,
    `globalThis.AFFINE_WORKER_WASM_URL = ${JSON.stringify(wasmUrl)};`,
    'const __q = [];',
    'const __onMsg = event => __q.push(event);',
    "globalThis.addEventListener('message', __onMsg);",
    `await import(${JSON.stringify(scriptUrl)});`,
    "globalThis.removeEventListener('message', __onMsg);",
    "for (const event of __q) globalThis.dispatchEvent(new MessageEvent('message', { data: event.data, ports: event.ports }));",
  ].join('\n');
}

/**
 * Creates a lazy worker and on-demand font loader pinned to this page's
 * immutable build hash manifest.
 *
 * @param {BuildManifest} rawManifest
 * @param {Object} [options]
 * @param {string} [options.baseUrl]
 * @param {string | null} [options.assetBaseUrl]
 * @param {string} [options.buildId]
 * @param {(url: string, opts: WorkerOptions) => Worker} [options.createWorker]
 * @param {(blob: Blob) => string} [options.createObjectURL]
 * @param {(url: string) => void} [options.revokeObjectURL]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createWorkerLoader(rawManifest, options = {}) {
  const manifest = freezeBuildManifest({
    ...rawManifest,
    buildId: options.buildId || rawManifest.buildId || rawManifest.buildHash,
    assetBaseUrl:
      options.assetBaseUrl !== undefined
        ? options.assetBaseUrl
        : rawManifest.assetBaseUrl,
  });
  const baseUrl =
    options.baseUrl ||
    (globalThis.location === undefined
      ? 'https://app.affine.pro/'
      : globalThis.location.href);
  const lockedAssetBaseUrl = manifest.assetBaseUrl || null;
  const lockedBuildId = manifest.buildId || manifest.buildHash;
  const hostOrigin = new URL(baseUrl).origin;
  const createWorker =
    options.createWorker || ((url, workerOpts) => new Worker(url, workerOpts));
  const createObjectURL =
    options.createObjectURL || (blob => URL.createObjectURL(blob));
  const revokeObjectURL =
    options.revokeObjectURL ||
    (url => {
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    });
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  /** @type {Map<string, Worker>} */
  const workerCache = new Map();
  /** @type {Map<string, string>} */
  const workerBlobUrls = new Map();

  /**
   * Resolves pinned `{ script, wasm }` asset URLs for one preview worker.
   *
   * @param {PreviewWorkerKind} kind
   * @returns {{ script: string, wasm: string }}
   */
  function resolveWorkerAssets(kind) {
    const entry = manifest.workers[kind];
    if (!entry) {
      throw new Error(`Unknown worker kind: ${kind}`);
    }
    return {
      script: pinUrl(entry.script, baseUrl, lockedBuildId, lockedAssetBaseUrl),
      wasm: pinUrl(entry.wasm, baseUrl, lockedBuildId, lockedAssetBaseUrl),
    };
  }

  /**
   * Resolves a pinned on-demand font asset URL from the frozen manifest.
   *
   * @param {string} scriptName
   * @returns {string}
   */
  function resolveFontUrl(scriptName) {
    const entry = manifest.fonts[scriptName];
    if (!entry) {
      throw new Error(`Unknown font script: ${scriptName}`);
    }
    return pinUrl(entry, baseUrl, lockedBuildId, lockedAssetBaseUrl);
  }

  /**
   * Resolves the pinned app entry JS URL (`default-app-entry.js`) when declared in the manifest.
   *
   * @returns {string | null}
   */
  function resolveAppEntryUrl() {
    if (!manifest.appEntryJs) {
      return null;
    }
    return pinUrl(
      manifest.appEntryJs,
      baseUrl,
      lockedBuildId,
      lockedAssetBaseUrl
    );
  }

  /**
   * Resolves the pinned main Wasm JS glue URL (`playground.js`) when declared in the manifest.
   *
   * @returns {string | null}
   */
  function resolveMainWasmJsUrl() {
    if (!manifest.mainWasmJs) {
      return null;
    }
    return pinUrl(
      manifest.mainWasmJs,
      baseUrl,
      lockedBuildId,
      lockedAssetBaseUrl
    );
  }

  /**
   * Lazily spawns and caches a preview Web Worker via a pinned ES module
   * `blob:` bootstrap script (never passes a `.wasm` URL to `new Worker`).
   *
   * @param {PreviewWorkerKind} kind
   * @returns {Worker}
   */
  function loadWorker(kind) {
    const existing = workerCache.get(kind);
    if (existing) {
      return existing;
    }
    const { script, wasm } = resolveWorkerAssets(kind);
    const source = buildWorkerBootstrapSource(hostOrigin, script, wasm);
    const blob = new Blob([source], { type: 'text/javascript' });
    const blobUrl = createObjectURL(blob);
    const worker = createWorker(blobUrl, {
      type: 'module',
      name: `affine-${kind}-${lockedBuildId}`,
    });
    workerCache.set(kind, worker);
    workerBlobUrls.set(kind, blobUrl);
    return worker;
  }

  /**
   * Returns true when a worker of `kind` has already been spawned.
   *
   * @param {PreviewWorkerKind} kind
   * @returns {boolean}
   */
  function hasLoadedWorker(kind) {
    return workerCache.has(kind);
  }

  /**
   * Terminates and removes a spawned worker of `kind`.
   *
   * @param {PreviewWorkerKind} kind
   * @returns {boolean}
   */
  function terminateWorker(kind) {
    const worker = workerCache.get(kind);
    if (!worker) {
      return false;
    }
    workerCache.delete(kind);
    const blobUrl = workerBlobUrls.get(kind);
    if (blobUrl) {
      workerBlobUrls.delete(kind);
      revokeObjectURL(blobUrl);
    }
    worker.terminate?.();
    return true;
  }

  /**
   * Terminates all spawned preview workers.
   */
  function dispose() {
    for (const kind of workerCache.keys()) {
      terminateWorker(/** @type {PreviewWorkerKind} */ (kind));
    }
  }

  /**
   * Fetches an on-demand TTF/OTF font binary pinned to this page's build hash.
   *
   * @param {string} scriptName
   * @returns {Promise<ArrayBuffer>}
   */
  async function loadFont(scriptName) {
    const url = resolveFontUrl(scriptName);
    const response = await fetchImpl(url, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`Font fetch failed (${response.status}): ${url}`);
    }
    return response.arrayBuffer();
  }

  return Object.freeze({
    manifest,
    buildId: lockedBuildId,
    assetBaseUrl: lockedAssetBaseUrl,
    resolveWorkerAssets,
    resolveFontUrl,
    resolveAppEntryUrl,
    resolveMainWasmJsUrl,
    loadWorker,
    hasLoadedWorker,
    terminateWorker,
    dispose,
    loadFont,
  });
}
