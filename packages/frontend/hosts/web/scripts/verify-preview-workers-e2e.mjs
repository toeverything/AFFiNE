#!/usr/bin/env node
// @ts-check

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';

import { createWorkerLoader } from '../src/worker-loader.js';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ASSETS_DIR = join(WEB_ROOT, 'assets');

/**
 * Builds a minimal 300x200 PDF filled with a solid RGB color.
 *
 * @param {string} rgbOp
 * @returns {Uint8Array}
 */
function buildSolidColorPdf(rgbOp) {
  const streamBody = `${rgbOp} 0 0 300 200 re f\n`;
  const pdf =
    '%PDF-1.4\n' +
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >> endobj\n' +
    `4 0 obj << /Length ${streamBody.length} >> stream\n` +
    streamBody +
    'endstream endobj\n' +
    'xref\n' +
    '0 5\n' +
    '0000000000 65535 f \n' +
    '0000000009 00000 n \n' +
    '0000000058 00000 n \n' +
    '0000000115 00000 n \n' +
    '0000000201 00000 n \n' +
    'trailer << /Size 5 /Root 1 0 R >>\n' +
    'startxref\n' +
    '295\n' +
    '%%EOF\n';
  return new Uint8Array(Buffer.from(pdf, 'ascii'));
}

/**
 * Serves only staged static files under `hosts/web/assets/`.
 *
 * @param {string | URL} url
 */
async function staticAssetsFetch(url) {
  const parsed = new URL(String(url));
  if (!parsed.pathname.startsWith('/assets/')) {
    return {
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  }
  const relPath = parsed.pathname.slice('/assets/'.length);
  const filePath = join(ASSETS_DIR, relPath);
  const buf = readFileSync(filePath);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

const indexHtml = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
const manifestMatch = indexHtml.match(
  /<script id="affine-build-manifest" type="application\/json">([\s\S]*?)<\/script>/
);
assert.ok(manifestMatch, 'index.html must contain #affine-build-manifest');
const manifest = JSON.parse(manifestMatch[1].trim());

/** @type {Map<string, Blob>} */
const blobSources = new Map();
let blobCounter = 0;

/** @type {NodeWorker[]} */
const activeWorkers = [];

const loader = createWorkerLoader(manifest, {
  baseUrl: 'https://app.affine.pro/workspace/ws-1/doc-2',
  fetchImpl: /** @type {typeof fetch} */ (
    /** @type {unknown} */ (staticAssetsFetch)
  ),
  createObjectURL(blob) {
    const id = `blob:https://app.affine.pro/e2e-${++blobCounter}`;
    blobSources.set(id, blob);
    return id;
  },
  createWorker(blobUrl) {
    const blob = blobSources.get(blobUrl);
    assert.ok(blob, `missing blob for ${blobUrl}`);
    const harnessScript = `
      import { readFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { parentPort, workerData } from 'node:worker_threads';

      const listeners = new Set();
      globalThis.addEventListener = (type, fn) => {
        if (type === 'message') listeners.add(fn);
      };
      globalThis.removeEventListener = (type, fn) => {
        if (type === 'message') listeners.delete(fn);
      };
      globalThis.dispatchEvent = event => {
        for (const fn of listeners) fn(event);
        return true;
      };
      globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
      globalThis.fetch = async url => {
        const parsed = new URL(String(url));
        if (!parsed.pathname.startsWith('/assets/')) {
          return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        }
        const filePath = join(workerData.assetsDir, parsed.pathname.slice('/assets/'.length));
        const buf = readFileSync(filePath);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        };
      };
      parentPort.on('message', data => {
        globalThis.dispatchEvent({ type: 'message', data, ports: [] });
      });

      const rewritten = workerData.bootstrapSource.replace(
        /await import\\("https:\\/\\/app\\.affine\\.pro\\/src\\/workers\\/([^"?]+)(?:\\?[^"]*)?"\\)/g,
        (_m, file) => 'await import(' + JSON.stringify(workerData.workersBaseUrl + file) + ')'
      );
      await import('data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64'));
    `;

    const readyWorker = blob.text().then(bootstrapSource => {
      const worker = new NodeWorker(harnessScript, {
        eval: true,
        workerData: {
          bootstrapSource,
          assetsDir: ASSETS_DIR,
          workersBaseUrl: pathToFileURL(
            join(WEB_ROOT, 'src/workers/')
          ).toString(),
        },
      });
      activeWorkers.push(worker);
      return worker;
    });

    return /** @type {unknown} */ ({
      async rpc(payload) {
        const w = await readyWorker;
        return new Promise((resolveRpc, rejectRpc) => {
          const onMsg = msg => {
            if (msg && msg.id === payload.id) {
              w.off('message', onMsg);
              w.off('error', onErr);
              resolveRpc(msg);
            }
          };
          const onErr = err => {
            w.off('message', onMsg);
            rejectRpc(err);
          };
          w.on('message', onMsg);
          w.once('error', onErr);
          w.postMessage(payload);
        });
      },
    });
  },
});

try {
  // 1. Verify all 4 worker assets and all manifest fonts resolve & load from static assets.
  for (const kind of /** @type {const} */ ([
    'mermaid',
    'math',
    'typst',
    'pdf',
  ])) {
    const assets = loader.resolveWorkerAssets(kind);
    assert.ok(
      assets.script.startsWith(
        `https://app.affine.pro/src/workers/${kind}-worker.js`
      ),
      `unexpected script URL for ${kind}: ${assets.script}`
    );
    assert.ok(
      assets.wasm.startsWith(
        `https://app.affine.pro/assets/${kind}-worker.dev-local.wasm`
      ),
      `unexpected wasm URL for ${kind}: ${assets.wasm}`
    );
  }

  /** @type {Record<string, Uint8Array>} */
  const loadedFonts = {};
  for (const fontKey of Object.keys(manifest.fonts)) {
    const fontBuf = await loader.loadFont(fontKey);
    assert.ok(
      fontBuf.byteLength > 10_000,
      `manifest font "${fontKey}" must load non-empty TTF bytes from static assets`
    );
    loadedFonts[fontKey] = new Uint8Array(fontBuf);
  }
  assert.ok(loadedFonts.latin && loadedFonts.mono);

  // 2. Mermaid worker: Light vs Dark themes must produce distinct themed SVGs.
  const mermaidWorker = /** @type {any} */ (loader.loadWorker('mermaid'));
  const mermaidSrc = 'flowchart LR\n  A[Start] --> B[End]';
  const mermaidLight = await mermaidWorker.rpc({
    id: 1,
    source: mermaidSrc,
    theme: 'light',
  });
  const mermaidDark = await mermaidWorker.rpc({
    id: 2,
    source: mermaidSrc,
    theme: 'dark',
  });
  assert.equal(
    mermaidLight.ok,
    true,
    `mermaid light failed: ${mermaidLight.error}`
  );
  assert.equal(
    mermaidDark.ok,
    true,
    `mermaid dark failed: ${mermaidDark.error}`
  );
  assert.ok(mermaidLight.result.svg.includes('<svg'));
  assert.ok(mermaidDark.result.svg.includes('<svg'));
  assert.notEqual(
    mermaidLight.result.svg,
    mermaidDark.result.svg,
    'Mermaid light and dark worker SVGs must differ'
  );
  assert.ok(
    mermaidLight.result.svg.toLowerCase().includes('#eef2ff'),
    'Mermaid light SVG must apply AFFiNE Light palette'
  );
  assert.ok(
    mermaidDark.result.svg.toLowerCase().includes('#1e2433'),
    'Mermaid dark SVG must apply AFFiNE Dark palette'
  );

  // 3. Math (RaTeX) worker
  const mathWorker = /** @type {any} */ (loader.loadWorker('math'));
  const mathRes = await mathWorker.rpc({
    id: 3,
    latex: 'x^2 + y^2 = z^2',
  });
  assert.equal(mathRes.ok, true, `math worker failed: ${mathRes.error}`);
  assert.ok(mathRes.result.svg.includes('<svg'));

  // 4. Typst worker: register fonts fetched via `loader.loadFont` and compile document.
  const typstWorker = /** @type {any} */ (loader.loadWorker('typst'));
  const latinReg = await typstWorker.rpc({
    id: 4,
    op: 'register_font',
    fontBytes: loadedFonts.latin,
  });
  const monoReg = await typstWorker.rpc({
    id: 5,
    op: 'register_font',
    fontBytes: loadedFonts.mono,
  });
  assert.equal(
    latinReg.ok,
    true,
    `typst latin register failed: ${latinReg.error}`
  );
  assert.equal(
    monoReg.ok,
    true,
    `typst mono register failed: ${monoReg.error}`
  );
  assert.ok(latinReg.result.faceCount >= 1);
  assert.ok(monoReg.result.faceCount >= 1);
  const typstRes = await typstWorker.rpc({
    id: 6,
    source: '= Hello Static Font\n`mono`',
    pageIndex: 0,
  });
  assert.equal(typstRes.ok, true, `typst worker failed: ${typstRes.error}`);
  assert.equal(typstRes.result.pageCount, 1);
  assert.ok(typstRes.result.svg.includes('<svg'));
  assert.ok(
    typstRes.result.svg.includes('<path') ||
      typstRes.result.svg.includes('<use'),
    'typst worker SVG must contain rendered glyph paths'
  );

  // 5. PDF (Hayro) worker: two distinct 300x200 PDFs must return transferable RGBA pixels matching fill color.
  const pdfWorker = /** @type {any} */ (loader.loadWorker('pdf'));
  const redRes = await pdfWorker.rpc({
    id: 7,
    pdfBytes: buildSolidColorPdf('0.9 0.1 0.1 rg'),
    pageIndex: 0,
  });
  const blueRes = await pdfWorker.rpc({
    id: 8,
    pdfBytes: buildSolidColorPdf('0.1 0.2 0.9 rg'),
    pageIndex: 0,
  });
  assert.equal(redRes.ok, true, `pdf red failed: ${redRes.error}`);
  assert.equal(blueRes.ok, true, `pdf blue failed: ${blueRes.error}`);

  for (const [label, res] of /** @type {const} */ ([
    ['red', redRes.result],
    ['blue', blueRes.result],
  ])) {
    assert.equal(res.pageCount, 1);
    assert.ok(res.widthPx > 0 && res.heightPx > 0);
    assert.ok(
      res.rgba instanceof Uint8Array,
      `${label} PDF result must return Uint8Array RGBA pixels`
    );
    assert.equal(
      res.rgba.byteLength,
      res.widthPx * res.heightPx * 4,
      `${label} PDF RGBA length must equal widthPx * heightPx * 4`
    );
  }

  const centerOffset = res =>
    (Math.floor(res.heightPx / 2) * res.widthPx + Math.floor(res.widthPx / 2)) *
    4;
  const redOff = centerOffset(redRes.result);
  const redR = redRes.result.rgba[redOff];
  const redB = redRes.result.rgba[redOff + 2];
  assert.ok(
    redR > 180 && redR > redB + 100,
    `red PDF center pixel mismatch: R=${redR}, B=${redB}`
  );

  const blueOff = centerOffset(blueRes.result);
  const blueR = blueRes.result.rgba[blueOff];
  const blueB = blueRes.result.rgba[blueOff + 2];
  assert.ok(
    blueB > 180 && blueB > blueR + 100,
    `blue PDF center pixel mismatch: R=${blueR}, B=${blueB}`
  );

  console.log(
    `E2E 4-worker + static-font verification passed: fonts(${Object.keys(loadedFonts).join(',')}), mermaid(light=${mermaidLight.result.svg.length}B vs dark=${mermaidDark.result.svg.length}B), math(${mathRes.result.svg.length}B), typst(1p ${typstRes.result.svg.length}B), pdf(red R=${redR}/B=${redB}, blue R=${blueR}/B=${blueB}, ${redRes.result.rgba.byteLength}B RGBA)`
  );
} finally {
  await Promise.all(activeWorkers.map(w => w.terminate()));
}
