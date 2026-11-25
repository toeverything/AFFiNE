// @ts-check

const OPCODE_REGISTER_FONT = 1;
const OPCODE_MERMAID_SVG = 2;
const OPCODE_MATH_SVG = 3;
const OPCODE_TYPST_SVG = 4;
const OPCODE_PDF_PAGE = 5;
const OPCODE_PDF_PAGE_SCALED = 6;
const OPCODE_PDF_PAGE_COUNT = 7;

const KIND_OPCODES = {
  mermaid: OPCODE_MERMAID_SVG,
  math: OPCODE_MATH_SVG,
  typst: OPCODE_TYPST_SVG,
  pdf: OPCODE_PDF_PAGE,
};

/**
 * Builds stub imports for unused `wasm-bindgen` JS glue entries so the raw
 * scalar `affine_worker_*` exports run directly under `WebAssembly.instantiate`
 * without requiring `wasm-bindgen-cli`.
 *
 * @param {WebAssembly.Module} mod
 * @returns {WebAssembly.Imports}
 */
function buildStubImports(mod) {
  /** @type {Record<string, Record<string, WebAssembly.ImportValue>>} */
  const imports = {};
  for (const desc of WebAssembly.Module.imports(mod)) {
    if (!imports[desc.module]) {
      imports[desc.module] = {};
    }
    if (desc.kind === 'function') {
      imports[desc.module][desc.name] = () => 0;
    } else if (desc.kind === 'global') {
      imports[desc.module][desc.name] = 0;
    }
  }
  return imports;
}

/**
 * Resolves a raw `affine_worker_*` export from `instance.exports`, matching
 * either the exact name or `wasm-bindgen`'s hashed export `<name>_<hex>`
 * (never matching `__wbindgen_describe_*` metadata exports).
 *
 * @param {Record<string, unknown>} rawExports
 * @param {string} baseName
 * @returns {Function}
 */
function resolveWorkerExport(rawExports, baseName) {
  if (typeof rawExports[baseName] === 'function') {
    return /** @type {Function} */ (rawExports[baseName]);
  }
  const prefix = `${baseName}_`;
  for (const [key, value] of Object.entries(rawExports)) {
    if (key.startsWith(prefix) && typeof value === 'function') {
      return value;
    }
  }
  throw new Error(`Worker wasm missing required export: ${baseName}`);
}

/**
 * Instantiates the pinned `.wasm` binary from `globalThis.AFFINE_WORKER_WASM_URL`
 * and returns a synchronous RPC invoker over the scalar `affine_worker_*` ABI.
 *
 * @param {string} wasmUrl
 */
async function loadWorkerExports(wasmUrl) {
  const response = await globalThis.fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch worker wasm (${response.status}): ${wasmUrl}`
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const mod = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(mod, buildStubImports(mod));
  const rawExports = /** @type {Record<string, unknown>} */ (
    /** @type {unknown} */ (instance.exports)
  );
  return {
    affine_worker_reset_input: resolveWorkerExport(
      rawExports,
      'affine_worker_reset_input'
    ),
    affine_worker_push_input_u32: resolveWorkerExport(
      rawExports,
      'affine_worker_push_input_u32'
    ),
    affine_worker_invoke: resolveWorkerExport(
      rawExports,
      'affine_worker_invoke'
    ),
    affine_worker_output_u32: resolveWorkerExport(
      rawExports,
      'affine_worker_output_u32'
    ),
  };
}

/**
 * Invokes `affine_worker_invoke` with `[opcode, ...payload]` and returns the
 * raw binary response frame (`[0x01, ...ok]` or `[0x00, ...utf8Err]`).
 *
 * @param {Record<string, Function>} exports
 * @param {number} opcode
 * @param {Uint8Array} payload
 * @returns {Uint8Array}
 */
function invokeRaw(exports, opcode, payload) {
  exports.affine_worker_reset_input();
  const full = new Uint8Array(1 + payload.length);
  full[0] = opcode;
  full.set(payload, 1);

  for (let i = 0; i < full.length; i += 4) {
    const valid = Math.min(4, full.length - i);
    const word =
      (full[i] || 0) |
      ((full[i + 1] || 0) << 8) |
      ((full[i + 2] || 0) << 16) |
      ((full[i + 3] || 0) << 24);
    exports.affine_worker_push_input_u32(word >>> 0, valid);
  }

  const outLen = Number(exports.affine_worker_invoke());
  const outBytes = new Uint8Array(outLen);
  const wordCount = Math.ceil(outLen / 4);
  for (let w = 0; w < wordCount; w += 1) {
    const word = Number(exports.affine_worker_output_u32(w)) >>> 0;
    const base = w * 4;
    if (base < outLen) outBytes[base] = word & 0xff;
    if (base + 1 < outLen) outBytes[base + 1] = (word >>> 8) & 0xff;
    if (base + 2 < outLen) outBytes[base + 2] = (word >>> 16) & 0xff;
    if (base + 3 < outLen) outBytes[base + 3] = (word >>> 24) & 0xff;
  }
  return outBytes;
}

/**
 * Prepends a 4-byte little-endian `pageIndex` header to a byte payload.
 *
 * @param {number} pageIndex
 * @param {Uint8Array} body
 * @returns {Uint8Array}
 */
function prependPageIndex(pageIndex, body) {
  const buf = new Uint8Array(4 + body.length);
  new DataView(buf.buffer).setUint32(0, pageIndex >>> 0, true);
  buf.set(body, 4);
  return buf;
}

/**
 * Prepends a 4-byte little-endian `pageIndex` and 4-byte little-endian `scale`
 * float header to a byte payload.
 *
 * @param {number} pageIndex
 * @param {number} scale
 * @param {Uint8Array} body
 * @returns {Uint8Array}
 */
function prependPageIndexAndScale(pageIndex, scale, body) {
  const buf = new Uint8Array(8 + body.length);
  const view = new DataView(buf.buffer);
  view.setUint32(0, pageIndex >>> 0, true);
  view.setFloat32(4, scale, true);
  buf.set(body, 8);
  return buf;
}

/**
 * Starts a dedicated preview Web Worker for one capability (`mermaid`, `math`,
 * `typst`, or `pdf`), reading its pinned `.wasm` URL from
 * `globalThis.AFFINE_WORKER_WASM_URL`.
 *
 * @param {'mermaid' | 'math' | 'typst' | 'pdf'} kind
 */
export function startPreviewWorker(kind) {
  const defaultOpcode = KIND_OPCODES[kind];
  if (!defaultOpcode) {
    throw new Error(`Unsupported preview worker kind: ${kind}`);
  }
  /** @type {Promise<Record<string, Function>> | null} */
  let exportsPromise = null;

  function ensureExports() {
    if (!exportsPromise) {
      const wasmUrl =
        /** @type {{ AFFINE_WORKER_WASM_URL?: string }} */ (
          /** @type {unknown} */ (globalThis)
        ).AFFINE_WORKER_WASM_URL;
      if (!wasmUrl) {
        return Promise.reject(
          new Error('Missing globalThis.AFFINE_WORKER_WASM_URL')
        );
      }
      exportsPromise = loadWorkerExports(wasmUrl);
    }
    return exportsPromise;
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  globalThis.addEventListener('message', async event => {
    const msg = event?.data;
    if (!msg || typeof msg !== 'object') {
      return;
    }
    const id = msg.id ?? null;
    try {
      const exports = await ensureExports();
      if (msg.op === 'register_font') {
        const fontBytes =
          msg.fontBytes instanceof Uint8Array
            ? msg.fontBytes
            : new Uint8Array(msg.fontBytes || []);
        const frame = invokeRaw(exports, OPCODE_REGISTER_FONT, fontBytes);
        if (frame.length < 5 || frame[0] !== 1) {
          throw new Error(decoder.decode(frame.subarray(1)) || 'font error');
        }
        const faceCount = new DataView(
          frame.buffer,
          frame.byteOffset,
          frame.byteLength
        ).getUint32(1, true);
        globalThis.postMessage({ id, ok: true, result: { faceCount } });
        return;
      }

      /** @type {Uint8Array} */
      let payloadBytes;
      let opcode = defaultOpcode;
      if (kind === 'mermaid') {
        const themeTag =
          msg.theme === 'light' ? 1 : msg.theme === 'dark' ? 2 : 0;
        const src = encoder.encode(String(msg.source ?? ''));
        payloadBytes = new Uint8Array(1 + src.length);
        payloadBytes[0] = themeTag;
        payloadBytes.set(src, 1);
      } else if (kind === 'typst') {
        payloadBytes = prependPageIndex(
          Number(msg.pageIndex ?? 0),
          encoder.encode(String(msg.source ?? ''))
        );
      } else if (kind === 'pdf') {
        const pdfBytes =
          msg.pdfBytes instanceof Uint8Array
            ? msg.pdfBytes
            : new Uint8Array(msg.pdfBytes || []);
        if (msg.op === 'page_count') {
          opcode = OPCODE_PDF_PAGE_COUNT;
          payloadBytes = pdfBytes;
        } else if (
          typeof msg.scale === 'number' &&
          Number.isFinite(msg.scale) &&
          msg.scale > 0
        ) {
          opcode = OPCODE_PDF_PAGE_SCALED;
          payloadBytes = prependPageIndexAndScale(
            Number(msg.pageIndex ?? 0),
            msg.scale,
            pdfBytes
          );
        } else {
          payloadBytes = prependPageIndex(Number(msg.pageIndex ?? 0), pdfBytes);
        }
      } else {
        payloadBytes = encoder.encode(String(msg.latex ?? msg.source ?? ''));
      }

      const frame = invokeRaw(exports, opcode, payloadBytes);
      if (frame.length === 0 || frame[0] !== 1) {
        throw new Error(decoder.decode(frame.subarray(1)) || 'worker error');
      }

      if (kind === 'typst') {
        const pageCount = new DataView(
          frame.buffer,
          frame.byteOffset,
          frame.byteLength
        ).getUint32(1, true);
        const svg = decoder.decode(frame.subarray(5));
        globalThis.postMessage({
          id,
          ok: true,
          result: { kind, pageCount, svg },
        });
        return;
      }

      if (kind === 'pdf') {
        const view = new DataView(
          frame.buffer,
          frame.byteOffset,
          frame.byteLength
        );
        const pageCount = view.getUint32(1, true);
        if (msg.op === 'page_count') {
          globalThis.postMessage({
            id,
            ok: true,
            result: { kind, pageCount },
          });
          return;
        }
        const widthPx = view.getUint32(5, true);
        const heightPx = view.getUint32(9, true);
        const rgba = frame.slice(13);
        const expectedBytes = widthPx * heightPx * 4;
        if (rgba.byteLength !== expectedBytes) {
          throw new Error(
            `PDF RGBA length mismatch: got ${rgba.byteLength}, expected ${expectedBytes}`
          );
        }
        globalThis.postMessage(
          {
            id,
            ok: true,
            result: { kind, pageCount, widthPx, heightPx, rgba },
          },
          [rgba.buffer]
        );
        return;
      }

      const svg = decoder.decode(frame.subarray(1));
      globalThis.postMessage({
        id,
        ok: true,
        result: { kind, svg },
      });
    } catch (error) {
      globalThis.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
