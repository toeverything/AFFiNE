// @ts-check

const ALLOWED_STUB_IMPORT_MODULES = new Set([
  '__wbindgen_placeholder__',
  '__wbindgen_externref_xform__',
]);

/**
 * Builds stub imports strictly for unused `wasm-bindgen` placeholder entries
 * so pure scalar `u32` Wasm exports run directly under `WebAssembly.instantiate`
 * without `wasm-bindgen-cli`. Any unexpected external host import module throws
 * immediately instead of silently returning `0`.
 *
 * @param {WebAssembly.Module} mod
 * @returns {WebAssembly.Imports}
 */
export function buildStubImports(mod) {
  /** @type {Record<string, Record<string, WebAssembly.ImportValue>>} */
  const imports = {};
  for (const desc of WebAssembly.Module.imports(mod)) {
    if (!ALLOWED_STUB_IMPORT_MODULES.has(desc.module)) {
      throw new Error(`Unexpected wasm import: ${desc.module}.${desc.name}`);
    }
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
 * Resolves a raw scalar export from `instance.exports`, matching either the
 * exact name or `wasm-bindgen`'s hashed export `<name>_<hex>` (never matching
 * `__wbindgen_describe_*` metadata exports).
 *
 * @param {Record<string, unknown>} rawExports
 * @param {string} baseName
 * @param {string} [label='Wasm']
 * @returns {Function}
 */
export function resolveWasmExport(rawExports, baseName, label = 'Wasm') {
  if (typeof rawExports[baseName] === 'function') {
    return /** @type {Function} */ (rawExports[baseName]);
  }
  const prefix = `${baseName}_`;
  for (const [key, value] of Object.entries(rawExports)) {
    if (key.startsWith(prefix) && typeof value === 'function') {
      return value;
    }
  }
  throw new Error(`${label} wasm missing required export: ${baseName}`);
}

/**
 * Streams `[opcode, ...payload]` into a scalar `u32` Wasm ABI and reads back
 * the raw binary response frame (`[0x01, ...ok]` or `[0x00, ...utf8Err]`).
 *
 * @param {{
 *   resetInput: Function,
 *   pushInputU32: Function,
 *   invoke: Function,
 *   outputU32: Function,
 * }} abi
 * @param {number} opcode
 * @param {Uint8Array} payload
 * @returns {Uint8Array}
 */
export function invokeScalarRpc(abi, opcode, payload) {
  abi.resetInput();
  const full = new Uint8Array(1 + payload.byteLength);
  full[0] = opcode;
  full.set(payload, 1);

  for (let i = 0; i < full.length; i += 4) {
    const valid = Math.min(4, full.length - i);
    const word =
      (full[i] || 0) |
      ((full[i + 1] || 0) << 8) |
      ((full[i + 2] || 0) << 16) |
      ((full[i + 3] || 0) << 24);
    abi.pushInputU32(word >>> 0, valid);
  }

  const outLen = Number(abi.invoke());
  const outBytes = new Uint8Array(outLen);
  const wordCount = Math.ceil(outLen / 4);
  for (let w = 0; w < wordCount; w += 1) {
    const word = Number(abi.outputU32(w)) >>> 0;
    const base = w * 4;
    if (base < outLen) outBytes[base] = word & 0xff;
    if (base + 1 < outLen) outBytes[base + 1] = (word >>> 8) & 0xff;
    if (base + 2 < outLen) outBytes[base + 2] = (word >>> 16) & 0xff;
    if (base + 3 < outLen) outBytes[base + 3] = (word >>> 24) & 0xff;
  }
  return outBytes;
}
