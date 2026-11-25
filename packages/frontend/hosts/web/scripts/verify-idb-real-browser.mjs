#!/usr/bin/env node
// @ts-check

/**
 * Real-browser Headless Chromium E2E gate for `src/idb-storage.js`.
 *
 * Uses a preinstalled Chromium binary (never runs `playwright install`) and
 * always stops the browser process by its exact PID inside `finally`, cleaning
 * up its temporary profile directory.
 *
 * Verifies in real Chromium `indexedDB` + `BroadcastChannel`:
 *   1. Overlapping `flush()` + concurrent `enqueue('c')` persists all 3 items
 *      exactly once with zero duplicates and zero drops.
 *   2. `pushDocUpdatesBatch` encountering a mid-batch `DataError` calls
 *      `tx.abort()` so zero partial rows persist.
 *   3. Cold-start `Promise.all` concurrent reads share a single `openPromise`,
 *      so `close()` -> `indexedDB.deleteDatabase(...)` completes immediately
 *      with zero `blocked` events.
 *   4. Legacy V1 `affine-local` database enumeration with built-in Yjs v1
 *      `ContentDoc` extractor discovers top-level subdocs and reads docs
 *      without mutating or creating empty V1 databases.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

function isSnapWrapper(bin) {
  if (!bin.startsWith('/usr/bin/chromium')) {
    return false;
  }
  try {
    const fd = openSync(bin, 'r');
    try {
      const buf = Buffer.alloc(256);
      const n = readSync(fd, buf, 0, buf.length, 0);
      const head = buf.subarray(0, n).toString('utf8');
      return head.startsWith('#!') && /snap/i.test(head);
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

function findChromiumBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  let snapFallback = null;
  for (const bin of candidates) {
    if (!bin || !existsSync(bin)) {
      continue;
    }
    if (isSnapWrapper(bin)) {
      snapFallback ??= bin;
      continue;
    }
    return bin;
  }
  const pwDir = join(process.env.HOME || '', '.cache/ms-playwright');
  if (existsSync(pwDir)) {
    const found = execFileSync(
      'find',
      [pwDir, '-name', 'chrome', '-type', 'f'],
      { encoding: 'utf8' }
    )
      .split('\n')
      .map(line => line.trim())
      .find(Boolean);
    if (found) {
      return found;
    }
  }
  if (snapFallback) {
    return snapFallback;
  }
  throw new Error('No preinstalled Chromium binary found on this machine');
}

const PROBE_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script type="module">
      import {
        createIdbV1ReadonlyReader,
        createIdbWorkspaceStorage,
        createPendingWriteFlusher,
      } from '/src/idb-storage.js';

      // Real Yjs v1 incremental updates: spaces.set('p1', 'old-guid') overwritten by 'live-guid'
      // via DeleteSet + foreign doc in otherMap -> must ONLY list 'live-guid'.
      const REAL_YJS_V1_UPDATES = [
        new Uint8Array([
          1, 6, 105, 0, 39, 1, 4, 109, 101, 116, 97, 5, 112, 97, 103, 101, 115, 0,
          7, 0, 105, 0, 1, 40, 0, 105, 1, 2, 105, 100, 1, 119, 2, 112, 49, 40, 0,
          105, 1, 5, 116, 105, 116, 108, 101, 1, 119, 9, 76, 105, 118, 101, 32, 80,
          97, 103, 101, 41, 1, 6, 115, 112, 97, 99, 101, 115, 2, 112, 49, 8, 111,
          108, 100, 45, 103, 117, 105, 100, 118, 0, 41, 1, 8, 111, 116, 104, 101,
          114, 77, 97, 112, 7, 102, 111, 114, 101, 105, 103, 110, 12, 102, 111, 114,
          101, 105, 103, 110, 45, 103, 117, 105, 100, 118, 0, 0,
        ]),
        new Uint8Array([
          1, 1, 105, 6, 169, 105, 4, 9, 108, 105, 118, 101, 45, 103, 117, 105, 100,
          118, 0, 1, 105, 1, 4, 1,
        ]),
      ];

      function deleteDb(name) {
        return new Promise((resolve, reject) => {
          let blocked = false;
          const req = indexedDB.deleteDatabase(name);
          req.onblocked = () => { blocked = true; };
          req.onsuccess = () => resolve({ deleted: true, blocked });
          req.onerror = () => reject(req.error || new Error('deleteDatabase failed'));
        });
      }

      async function runAll() {
        const enc = new TextEncoder();
        const result = {};

        // 1. Overlapping flush() + concurrent enqueue('c') must persist a, b, c once each.
        {
          const storage = createIdbWorkspaceStorage({ flavour: 'local', type: 'workspace', id: 'e2e-flush' });
          const flusher = createPendingWriteFlusher(storage);
          flusher.enqueue({ docId: 'doc-a', bin: enc.encode('a') });
          flusher.enqueue({ docId: 'doc-b', bin: enc.encode('b') });
          const p1 = flusher.flush();
          const p2 = flusher.flush();
          flusher.enqueue({ docId: 'doc-c', bin: enc.encode('c') });
          const [r1, r2] = await Promise.all([p1, p2]);
          const rawA = await storage.getDocRaw('doc-a');
          const rawB = await storage.getDocRaw('doc-b');
          const rawC = await storage.getDocRaw('doc-c');
          result.overlappingFlush = {
            ok1: r1.ok,
            ok2: r2.ok,
            pendingAfter: flusher.pendingCount(),
            rowsA: rawA?.updates.length ?? 0,
            rowsB: rawB?.updates.length ?? 0,
            rowsC: rawC?.updates.length ?? 0,
          };
          storage.close();
          await deleteDb(storage.dbName);
        }

        // 2. Mid-batch DataError must trigger tx.abort() with 0 partial rows persisted.
        {
          const storage = createIdbWorkspaceStorage({ flavour: 'local', type: 'workspace', id: 'e2e-atomic' });
          let errorName = null;
          try {
            await storage.pushDocUpdatesBatch([
              { docId: 'doc-first', bin: enc.encode('first') },
              { docId: /** @type {any} */ (undefined), bin: enc.encode('bad') },
            ]);
          } catch (err) {
            errorName = err?.name || String(err);
          }
          const firstRow = await storage.getDocRaw('doc-first');
          result.batchAtomicity = {
            errorName,
            firstPersisted: firstRow !== null,
          };
          storage.close();
          await deleteDb(storage.dbName);
        }

        // 3. Concurrent cold-start Promise.all reads must share 1 open connection so deleteDatabase is never blocked.
        {
          const storage = createIdbWorkspaceStorage({ flavour: 'local', type: 'workspace', id: 'e2e-open' });
          await Promise.all([
            storage.getDocRaw('d1'),
            storage.getDocRaw('d2'),
            storage.getDocRaw('d3'),
          ]);
          storage.close();
          result.concurrentOpenDelete = await deleteDb(storage.dbName);
        }

        // 4. V1 readonly reader: zero empty DB creation when missing, and built-in Yjs v1 subdoc extraction when present.
        {
          const missingReader = createIdbV1ReadonlyReader({ workspaceId: 'ws-v1-e2e' });
          const missingDoc = await missingReader.getV1DocRaw('ws-v1-e2e');
          const dbsAfterMissing = await indexedDB.databases();
          const createdEmpty = dbsAfterMissing.some(d => d.name === 'affine-local');

          // Seed real V1 affine-local DB.
          const v1Db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('affine-local', 1);
            req.onupgradeneeded = () => {
              req.result.createObjectStore('workspace', { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const tx = v1Db.transaction('workspace', 'readwrite');
          tx.objectStore('workspace').put({
            id: 'ws-v1-e2e',
            updates: REAL_YJS_V1_UPDATES.map((update, idx) => ({
              timestamp: 100 + idx,
              update,
            })),
          });
          tx.objectStore('workspace').put({
            id: 'live-guid',
            updates: [{ timestamp: 200, update: enc.encode('subdoc-body') }],
          });
          tx.objectStore('workspace').put({
            id: 'old-guid',
            updates: [{ timestamp: 200, update: enc.encode('stale-body') }],
          });
          tx.objectStore('workspace').put({
            id: 'foreign-guid',
            updates: [{ timestamp: 200, update: enc.encode('foreign-body') }],
          });
          tx.objectStore('workspace').put({
            id: 'userdata$u1$ws-v1-e2e',
            updates: [{ timestamp: 200, update: enc.encode('root-ud') }],
          });
          tx.objectStore('workspace').put({
            id: 'userdata$u1$ws-v1-e2e$fav',
            updates: [{ timestamp: 201, update: enc.encode('fav') }],
          });
          tx.objectStore('workspace').put({
            id: 'userdata$u1$ws-v1-e2e$fav$extra',
            updates: [{ timestamp: 202, update: enc.encode('bad-5-seg') }],
          });
          await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onabort = reject;
          });
          v1Db.close();

          const reader = createIdbV1ReadonlyReader({ workspaceId: 'ws-v1-e2e' });
          const listed = await reader.listV1DocIds();
          const subRaw = await reader.getV1DocRaw('live-guid');
          result.v1 = {
            missingDoc,
            createdEmpty,
            listed,
            subdocBytes: subRaw ? subRaw.updates[0].byteLength : 0,
          };
          await deleteDb('affine-local');
        }

        window.__IDB_E2E_RESULT__ = result;
      }

      runAll().catch(err => {
        window.__IDB_E2E_ERROR__ = err?.stack || String(err);
      });
    </script>
  </body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/probe.html') {
    res.writeHead(200, { 'content-type': MIME_TYPES['.html'] });
    res.end(PROBE_HTML);
    return;
  }
  const rel = normalize(url.pathname).replace(/^\/+/, '');
  const full = resolve(WEB_ROOT, rel);
  if (!full.startsWith(WEB_ROOT) || !existsSync(full)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME_TYPES[extname(full)] || 'application/octet-stream',
  });
  res.end(readFileSync(full));
});

const chromeBin = findChromiumBinary();
const profileDir = mkdtempSync(join(tmpdir(), 'affine-idb-e2e-'));
await new Promise(resolveListen =>
  server.listen(0, '127.0.0.1', resolveListen)
);
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;

const chromeProc = spawn(
  chromeBin,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

let ws = null;
try {
  const wsUrl = await new Promise((resolveWs, rejectWs) => {
    let stderrBuf = '';
    const timer = setTimeout(
      () => rejectWs(new Error(`Chromium DevTools timeout: ${stderrBuf}`)),
      15000
    );
    chromeProc.stderr.on('data', chunk => {
      stderrBuf += String(chunk);
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolveWs(m[1]);
      }
    });
    chromeProc.once('exit', code => {
      clearTimeout(timer);
      rejectWs(new Error(`Chromium exited early (${code}): ${stderrBuf}`));
    });
  });

  const debugPort = new URL(wsUrl).port;
  const targets = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  ).json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', fail, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message));
      else ok(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = nextId++;
      pending.set(id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJs = async expression => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text);
    }
    return r.result?.value;
  };

  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/probe.html` });

  let probeResult = null;
  for (let i = 0; i < 100; i += 1) {
    const err = await evalJs('window.__IDB_E2E_ERROR__ || null');
    if (err) {
      throw new Error(`Browser probe error: ${err}`);
    }
    const res = await evalJs('window.__IDB_E2E_RESULT__ || null');
    if (res) {
      probeResult = res;
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(probeResult, 'IDB real-browser probe did not complete in time');

  assert.deepEqual(probeResult.overlappingFlush, {
    ok1: true,
    ok2: true,
    pendingAfter: 0,
    rowsA: 1,
    rowsB: 1,
    rowsC: 1,
  });
  assert.equal(probeResult.batchAtomicity.firstPersisted, false);
  assert.ok(probeResult.batchAtomicity.errorName);
  assert.deepEqual(probeResult.concurrentOpenDelete, {
    deleted: true,
    blocked: false,
  });
  assert.equal(probeResult.v1.missingDoc, null);
  assert.equal(probeResult.v1.createdEmpty, false);
  assert.deepEqual(probeResult.v1.listed, [
    'ws-v1-e2e',
    'live-guid',
    'userdata$u1$ws-v1-e2e',
    'userdata$u1$ws-v1-e2e$fav',
  ]);
  assert.equal(probeResult.v1.subdocBytes, 11);

  console.log(
    `Real-browser IDB E2E passed (${chromeBin}):`,
    JSON.stringify(probeResult)
  );
} finally {
  try {
    ws?.close();
  } catch {}
  try {
    if (chromeProc.pid) {
      process.kill(chromeProc.pid, 'SIGTERM');
    }
  } catch {}
  await new Promise(r => setTimeout(r, 200));
  try {
    if (chromeProc.pid) {
      process.kill(chromeProc.pid, 'SIGKILL');
    }
  } catch {}
  server.close();
  rmSync(profileDir, { recursive: true, force: true });
}
