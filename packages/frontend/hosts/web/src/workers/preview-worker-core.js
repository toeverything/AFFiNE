// @ts-check

import {
  buildStubImports,
  invokeScalarRpc,
  resolveWasmExport,
} from '../wasm-scalar-rpc.js';

const OPCODE_REGISTER_FONT = 1;
const OPCODE_MERMAID_SVG = 2;
const OPCODE_MATH_SVG = 3;
const OPCODE_TYPST_SVG = 4;
const OPCODE_PDF_PAGE = 5;
const OPCODE_PDF_PAGE_SCALED = 6;
const OPCODE_PDF_PAGE_COUNT = 7;
const OPCODE_MATH_RGBA = 8;

const KIND_OPCODES = {
  mermaid: OPCODE_MERMAID_SVG,
  math: OPCODE_MATH_SVG,
  typst: OPCODE_TYPST_SVG,
  pdf: OPCODE_PDF_PAGE,
};

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
    resetInput: resolveWasmExport(
      rawExports,
      'affine_worker_reset_input',
      'Worker'
    ),
    pushInputU32: resolveWasmExport(
      rawExports,
      'affine_worker_push_input_u32',
      'Worker'
    ),
    invoke: resolveWasmExport(rawExports, 'affine_worker_invoke', 'Worker'),
    outputU32: resolveWasmExport(
      rawExports,
      'affine_worker_output_u32',
      'Worker'
    ),
  };
}

/**
 * Invokes `affine_worker_invoke` with `[opcode, ...payload]` and returns the
 * raw binary response frame (`[0x01, ...ok]` or `[0x00, ...utf8Err]`).
 *
 * @param {{ resetInput: Function, pushInputU32: Function, invoke: Function, outputU32: Function }} exports
 * @param {number} opcode
 * @param {Uint8Array} payload
 * @returns {Uint8Array}
 */
function invokeRaw(exports, opcode, payload) {
  return invokeScalarRpc(exports, opcode, payload);
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
 * Encodes a `math` RGBA rasterization request (`OPCODE_MATH_RGBA = 8`).
 *
 * @param {TextEncoder} encoder
 * @param {{ display?: boolean, fontSizePt?: number, paddingPt?: number, scaleFactor?: number, colorCss?: string, latex?: string, source?: string }} msg
 * @returns {Uint8Array}
 */
function encodeMathRgbaPayload(encoder, msg) {
  const colorBytes = encoder.encode(String(msg.colorCss || '#000000'));
  const latexBytes = encoder.encode(String(msg.latex ?? msg.source ?? ''));
  const buf = new Uint8Array(15 + colorBytes.length + latexBytes.length);
  const view = new DataView(buf.buffer);
  buf[0] = msg.display ? 1 : 0;
  view.setFloat32(1, Number(msg.fontSizePt) || 16.0, true);
  view.setFloat32(
    5,
    Number.isFinite(Number(msg.paddingPt))
      ? Number(msg.paddingPt)
      : msg.display
        ? 4.0
        : 1.5,
    true
  );
  view.setFloat32(9, Number(msg.scaleFactor) || 2.0, true);
  view.setUint16(13, colorBytes.length, true);
  buf.set(colorBytes, 15);
  buf.set(latexBytes, 15 + colorBytes.length);
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
      exportsPromise = loadWorkerExports(wasmUrl).catch(err => {
        exportsPromise = null;
        throw err;
      });
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
      } else if (kind === 'math' && msg.op === 'rgba') {
        opcode = OPCODE_MATH_RGBA;
        payloadBytes = encodeMathRgbaPayload(encoder, msg);
      } else {
        payloadBytes = encoder.encode(String(msg.latex ?? msg.source ?? ''));
      }

      const frame = invokeRaw(exports, opcode, payloadBytes);
      if (frame.length === 0 || frame[0] !== 1) {
        throw new Error(decoder.decode(frame.subarray(1)) || 'worker error');
      }

      if (kind === 'math' && opcode === OPCODE_MATH_RGBA) {
        if (frame.length < 21) {
          throw new Error(`Truncated math RGBA response (${frame.length})`);
        }
        const view = new DataView(
          frame.buffer,
          frame.byteOffset,
          frame.byteLength
        );
        const widthPt = view.getFloat32(1, true);
        const ascentPt = view.getFloat32(5, true);
        const descentPt = view.getFloat32(9, true);
        const widthPx = view.getUint32(13, true);
        const heightPx = view.getUint32(17, true);
        const rgba = frame.slice(21);
        const expectedBytes = widthPx * heightPx * 4;
        if (rgba.byteLength !== expectedBytes) {
          throw new Error(
            `Math RGBA length mismatch: got ${rgba.byteLength}, expected ${expectedBytes}`
          );
        }
        globalThis.postMessage(
          {
            id,
            ok: true,
            result: {
              kind,
              widthPt,
              ascentPt,
              descentPt,
              widthPx,
              heightPx,
              rgba,
            },
          },
          [rgba.buffer]
        );
        return;
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
