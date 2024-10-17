import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'node:path';
import { WASI } from 'node:wasi';
import { parentPort, Worker } from 'node:worker_threads';

const require = createRequire(import.meta.url);

const {
  instantiateNapiModuleSync,
  MessageHandler,
  getDefaultContext,
} = require('@napi-rs/wasm-runtime');

if (parentPort) {
  parentPort.on('message', data => {
    globalThis.onmessage({ data });
  });
}

Object.assign(globalThis, {
  self: globalThis,
  require,
  Worker,
  importScripts: function (f) {
    (0, eval)(fs.readFileSync(f, 'utf8') + '//# sourceURL=' + f);
  },
  postMessage: function (msg) {
    if (parentPort) {
      parentPort.postMessage(msg);
    }
  },
});

const emnapiContext = getDefaultContext();

const __rootDir = parse(process.cwd()).root;

const handler = new MessageHandler({
  onLoad({ wasmModule, wasmMemory }) {
    const wasi = new WASI({
      version: 'preview1',
      env: process.env,
      preopens: {
        [__rootDir]: __rootDir,
      },
    });

    return instantiateNapiModuleSync(wasmModule, {
      childThread: true,
      wasi,
      context: emnapiContext,
      overwriteImports(importObject) {
        importObject.env = {
          ...importObject.env,
          ...importObject.napi,
          ...importObject.emnapi,
          memory: wasmMemory,
        };
      },
    });
  },
});

globalThis.onmessage = function (e) {
  handler.handle(e);
};
