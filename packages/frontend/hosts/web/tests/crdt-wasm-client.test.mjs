// @ts-check

import assert from 'node:assert/strict';
import test from 'node:test';

import { createCrdtWasmClient } from '../src/crdt-wasm-client.js';
import { buildStubImports } from '../src/wasm-scalar-rpc.js';
import {
  createWorkerLoader,
  freezeBuildManifest,
} from '../src/worker-loader.js';

const REAL_YJS_V1_UPDATES = [
  new Uint8Array([
    1, 6, 105, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0, 7,
    0, 105, 0, 1, 40, 0, 105, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0, 105, 1,
    5, 116, 105, 116, 108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80, 97, 103,
    101, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112, 49, 8, 111, 108, 100, 45,
    103, 117, 105, 100, 118, 0, 41, 1, 8, 111, 116, 104, 101, 114, 77, 97, 112,
    7, 102, 111, 114, 101, 105, 103, 110, 12, 102, 111, 114, 101, 105, 103, 110,
    45, 103, 117, 105, 100, 118, 0, 0,
  ]),
  new Uint8Array([
    1, 1, 105, 6, 169, 105, 4, 9, 108, 105, 118, 101, 45, 103, 117, 105, 100,
    118, 0, 1, 105, 1, 4, 1,
  ]),
];

void test('worker-loader freezes and pins optional crdtCodecWasm URL', () => {
  const manifest = freezeBuildManifest({
    shellVersion: 'mobile-v1',
    buildHash: 'abc123',
    crdtCodecWasm: '/assets/crdt-codec.wasm',
    workers: {
      mermaid: { script: '/src/m.js', wasm: '/assets/m.wasm' },
      math: { script: '/src/ma.js', wasm: '/assets/ma.wasm' },
      typst: { script: '/src/t.js', wasm: '/assets/t.wasm' },
      pdf: { script: '/src/p.js', wasm: '/assets/p.wasm' },
    },
    fonts: {},
  });
  assert.equal(manifest.crdtCodecWasm, '/assets/crdt-codec.wasm');

  const loader = createWorkerLoader(manifest, {
    baseUrl: 'https://app.affine.pro/workspace/ws-1/page-2',
    assetBaseUrl: 'https://cdn.affine.pro/builds/abc123/',
  });
  assert.equal(
    loader.resolveCrdtCodecUrl(),
    'https://cdn.affine.pro/builds/abc123/assets/crdt-codec.wasm'
  );

  const unpinnedLoader = createWorkerLoader(manifest, {
    baseUrl: 'https://app.affine.pro/workspace/ws-1/page-2',
  });
  assert.equal(
    unpinnedLoader.resolveCrdtCodecUrl(),
    'https://app.affine.pro/assets/crdt-codec.wasm?v=abc123'
  );

  const withoutCodec = createWorkerLoader({
    shellVersion: 'mobile-v1',
    buildHash: 'abc123',
    workers: manifest.workers,
    fonts: {},
  });
  assert.equal(withoutCodec.resolveCrdtCodecUrl(), null);
});

void test('createCrdtWasmClient fails explicitly on missing URL, HTTP 404, corrupt wasm, and clears failed cache', async () => {
  const emptyClient = createCrdtWasmClient('');
  await assert.rejects(
    () => emptyClient.ready(),
    /Missing CRDT codec wasm URL/
  );

  let fetchCalls = 0;
  const httpFailClient = createCrdtWasmClient('/assets/crdt-codec.wasm', {
    fetchImpl: async () => {
      fetchCalls += 1;
      return /** @type {Response} */ (
        /** @type {unknown} */ ({
          ok: false,
          status: 404,
          arrayBuffer: async () => new ArrayBuffer(0),
        })
      );
    },
  });
  await assert.rejects(
    () => httpFailClient.extractSubdocIds(REAL_YJS_V1_UPDATES),
    /Failed to fetch CRDT codec wasm \(404\)/
  );
  // Retrying after failure must re-attempt fetch rather than staying stuck on a stale rejection.
  await assert.rejects(
    () => httpFailClient.ready(),
    /Failed to fetch CRDT codec wasm \(404\)/
  );
  assert.equal(fetchCalls, 2);

  const corruptClient = createCrdtWasmClient('/assets/crdt-codec.wasm', {
    fetchImpl: async () => /** @type {Response} */ (
      /** @type {unknown} */ ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([0, 1, 2, 3]).buffer,
      })
    ),
  });
  await assert.rejects(() => corruptClient.mergeUpdates(REAL_YJS_V1_UPDATES));
});

void test('buildStubImports rejects unexpected non-wbindgen host import modules', async () => {
  // Minimal valid Wasm module importing `(import "env" "clock_now" (func (result i32)))`.
  const wasmWithEnvImport = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60,
    0x00, 0x01, 0x7f, 0x02, 0x11, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x09, 0x63,
    0x6c, 0x6f, 0x63, 0x6b, 0x5f, 0x6e, 0x6f, 0x77, 0x00, 0x00,
  ]);
  const mod = await WebAssembly.compile(wasmWithEnvImport);
  assert.throws(
    () => buildStubImports(mod),
    /Unexpected wasm import: env\.clock_now/
  );
});
