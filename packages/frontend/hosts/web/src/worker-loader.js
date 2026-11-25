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
 * @property {string | null} [appEntryJs]
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
  if (!raw.buildHash || typeof raw.buildHash !== 'string') {
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
  return Object.freeze({
    shellVersion: String(raw.shellVersion || 'mobile-v1'),
    buildHash: raw.buildHash,
    appEntryJs: typeof raw.appEntryJs === 'string' ? raw.appEntryJs : null,
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
 * Resolves a pinned asset URL against the site root (`new URL('/', baseUrl)`)
 * so nested routes like `/workspace/123` never turn `/assets/...` or
 * `./assets/...` into `/workspace/assets/...` 404s.
 *
 * @param {string} assetUrl
 * @param {string} baseUrl
 * @param {string} buildHash
 * @returns {string}
 */
function pinUrl(assetUrl, baseUrl, buildHash) {
  const siteRoot = new URL('/', baseUrl);
  const resolved = new URL(assetUrl, siteRoot);
  if (!resolved.pathname.includes(buildHash)) {
    resolved.searchParams.set('v', buildHash);
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
 * @param {(url: string, opts: WorkerOptions) => Worker} [options.createWorker]
 * @param {(blob: Blob) => string} [options.createObjectURL]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createWorkerLoader(rawManifest, options = {}) {
  const manifest = freezeBuildManifest(rawManifest);
  const baseUrl =
    options.baseUrl ||
    (globalThis.location === undefined
      ? 'https://app.affine.pro/'
      : globalThis.location.href);
  const hostOrigin = new URL(baseUrl).origin;
  const createWorker =
    options.createWorker || ((url, workerOpts) => new Worker(url, workerOpts));
  const createObjectURL =
    options.createObjectURL || (blob => URL.createObjectURL(blob));
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  /** @type {Map<string, Worker>} */
  const workerCache = new Map();

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
      script: pinUrl(entry.script, baseUrl, manifest.buildHash),
      wasm: pinUrl(entry.wasm, baseUrl, manifest.buildHash),
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
    return pinUrl(entry, baseUrl, manifest.buildHash);
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
      name: `affine-${kind}-${manifest.buildHash}`,
    });
    workerCache.set(kind, worker);
    return worker;
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
    resolveWorkerAssets,
    resolveFontUrl,
    loadWorker,
    loadFont,
  });
}
