// @ts-check

import {
  buildStubImports,
  invokeScalarRpc,
  resolveWasmExport,
} from './wasm-scalar-rpc.js';

const OPCODE_MERGE_UPDATES_V1 = 1;
const OPCODE_EXTRACT_SUBDOC_IDS = 2;

/**
 * Normalizes an update payload into a `Uint8Array`.
 *
 * @param {unknown} value
 * @returns {Uint8Array}
 */
function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('CRDT update frames must be Uint8Array or ArrayBuffer');
}

/**
 * Encodes `[frame_count: u32_le, (len_i: u32_le, bytes_i)...]`.
 *
 * @param {Uint8Array[]} updates
 * @returns {Uint8Array}
 */
function encodeFramesPayload(updates) {
  if (!Array.isArray(updates)) {
    throw new TypeError('CRDT updates must be an array');
  }
  const frames = updates.map(toUint8Array);
  let totalBytes = 4;
  for (const frame of frames) {
    totalBytes += 4 + frame.byteLength;
  }
  const buf = new Uint8Array(totalBytes);
  const view = new DataView(buf.buffer);
  view.setUint32(0, frames.length >>> 0, true);
  let offset = 4;
  for (const frame of frames) {
    view.setUint32(offset, frame.byteLength >>> 0, true);
    offset += 4;
    buf.set(frame, offset);
    offset += frame.byteLength;
  }
  return buf;
}

/**
 * Creates a zero-dependency WebAssembly client backed by `affine-store`'s
 * `wasm-codec` binary (`crdt-codec.<hash>.wasm`).
 *
 * @param {string} wasmUrl
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export function createCrdtWasmClient(wasmUrl, { fetchImpl } = {}) {
  const decoder = new TextDecoder();
  /** @type {Promise<{ resetInput: Function, pushInputU32: Function, invoke: Function, outputU32: Function }> | null} */
  let exportsPromise = null;

  async function loadExports() {
    if (typeof wasmUrl !== 'string' || !wasmUrl.trim()) {
      throw new Error('Missing CRDT codec wasm URL');
    }
    const fetchFn = fetchImpl || globalThis.fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('Missing fetch implementation for CRDT codec wasm');
    }
    const response = await fetchFn(wasmUrl);
    if (!response || !response.ok) {
      throw new Error(
        `Failed to fetch CRDT codec wasm (${response?.status ?? 'unknown'}): ${wasmUrl}`
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
        'affine_crdt_reset_input',
        'CRDT codec'
      ),
      pushInputU32: resolveWasmExport(
        rawExports,
        'affine_crdt_push_input_u32',
        'CRDT codec'
      ),
      invoke: resolveWasmExport(rawExports, 'affine_crdt_invoke', 'CRDT codec'),
      outputU32: resolveWasmExport(
        rawExports,
        'affine_crdt_output_u32',
        'CRDT codec'
      ),
    };
  }

  /**
   * Loads and instantiates the CRDT codec Wasm binary on first call.
   * Failures clear the cached promise so retries are not stuck on a stale error.
   *
   * @returns {Promise<{ resetInput: Function, pushInputU32: Function, invoke: Function, outputU32: Function }>}
   */
  function ready() {
    if (!exportsPromise) {
      exportsPromise = loadExports().catch(err => {
        exportsPromise = null;
        throw err;
      });
    }
    return exportsPromise;
  }

  /**
   * Merges one or more Yjs v1 binary updates into a single v1 binary update.
   *
   * @param {Uint8Array[]} updates
   * @returns {Promise<Uint8Array>}
   */
  async function mergeUpdates(updates) {
    const abi = await ready();
    const payload = encodeFramesPayload(updates);
    const frame = invokeScalarRpc(abi, OPCODE_MERGE_UPDATES_V1, payload);
    if (frame.length < 1 || frame[0] !== 1) {
      const msg =
        frame.length > 1
          ? decoder.decode(frame.subarray(1))
          : 'CRDT mergeUpdates failed';
      throw new Error(msg);
    }
    return frame.slice(1);
  }

  /**
   * Extracts sorted top-level page subdoc GUIDs from legacy V1 root updates.
   *
   * @param {Uint8Array[]} rootUpdates
   * @returns {Promise<string[]>}
   */
  async function extractSubdocIds(rootUpdates) {
    const abi = await ready();
    const payload = encodeFramesPayload(rootUpdates);
    const frame = invokeScalarRpc(abi, OPCODE_EXTRACT_SUBDOC_IDS, payload);
    if (frame.length < 1 || frame[0] !== 1) {
      const msg =
        frame.length > 1
          ? decoder.decode(frame.subarray(1))
          : 'CRDT extractSubdocIds failed';
      throw new Error(msg);
    }
    const parsed = JSON.parse(decoder.decode(frame.subarray(1)));
    if (!Array.isArray(parsed)) {
      throw new Error('CRDT extractSubdocIds returned non-array payload');
    }
    return parsed.map(String);
  }

  return Object.freeze({
    wasmUrl,
    ready,
    mergeUpdates,
    extractSubdocIds,
  });
}
