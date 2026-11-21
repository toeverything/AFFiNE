#!/usr/bin/env node
/**
 * Self-contained headless Chromium WebAssembly smoke test (zero npm dependencies).
 *
 * Serves `web/` over localhost, launches headless Chromium via CDP with SwiftShader
 * WebGL2 enabled, and asserts:
 *   1. Zero uncaught JS exceptions / Wasm panics.
 *   2. Non-blank rendered `<canvas>` containing actual dark ink glyph pixels inside
 *      the title and mode-switcher pill regions.
 *   3. Clicking the `"Edgeless"` button on the `<canvas>` triggers an observable
 *      visual state transition to Edgeless mode.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const WEB_DIR = path.join(ROOT, 'web');

function parseArgs(argv) {
  const args = {
    outPage: path.join(ROOT, 'artifacts', 'wasm-chromium.png'),
    outEdgeless: path.join(ROOT, 'artifacts', 'wasm-chromium-edgeless.png'),
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      args.outPage = path.resolve(argv[++i]);
    } else if (argv[i] === '--out-edgeless' && argv[i + 1]) {
      args.outEdgeless = path.resolve(argv[++i]);
    }
  }
  return args;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const home = process.env.HOME || '';
  const pwRoot = path.join(home, '.cache', 'ms-playwright');
  if (fs.existsSync(pwRoot)) {
    for (const entry of fs.readdirSync(pwRoot)) {
      const p = path.join(pwRoot, entry, 'chrome-linux64', 'chrome');
      if (fs.existsSync(p)) return p;
      const p2 = path.join(pwRoot, entry, 'chrome-linux', 'chrome');
      if (fs.existsSync(p2)) return p2;
    }
  }
  throw new Error('Could not find Chromium/Chrome binary (set CHROME_BIN)');
}

function mimeType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

function startStaticServer(dir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const abs = path.resolve(dir, rel);
      if (!abs.startsWith(dir) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': mimeType(abs),
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(abs).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

function decodePngRgba(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('Invalid PNG signature');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);
  const prevRow = new Uint8Array(stride);
  const curRow = new Uint8Array(stride);

  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[rowStart + i];
      const a = i >= bpp ? curRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 0xff;
      else if (filter === 2) val = (x + b) & 0xff;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) val = (x + paeth(a, b, c)) & 0xff;
      curRow[i] = val;
    }
    for (let x = 0; x < width; x += 1) {
      const dst = (y * width + x) * 4;
      const src = x * bpp;
      rgba[dst] = curRow[src];
      rgba[dst + 1] = curRow[src + 1];
      rgba[dst + 2] = curRow[src + 2];
      rgba[dst + 3] = bpp === 4 ? curRow[src + 3] : 255;
    }
    prevRow.set(curRow);
  }
  return { width, height, rgba };
}

function countDarkInkPixels(img, x0, y0, x1, y1) {
  let dark = 0;
  const minX = Math.max(0, Math.floor(x0));
  const minY = Math.max(0, Math.floor(y0));
  const maxX = Math.min(img.width, Math.ceil(x1));
  const maxY = Math.min(img.height, Math.ceil(y1));
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const idx = (y * img.width + x) * 4;
      const r = img.rgba[idx];
      const g = img.rgba[idx + 1];
      const b = img.rgba[idx + 2];
      if (r < 140 && g < 140 && b < 140) dark += 1;
    }
  }
  return dark;
}

function countDifferentPixels(a, b) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.rgba.length; i += 4) {
    if (
      Math.abs(a.rgba[i] - b.rgba[i]) > 4 ||
      Math.abs(a.rgba[i + 1] - b.rgba[i + 1]) > 4 ||
      Math.abs(a.rgba[i + 2] - b.rgba[i + 2]) > 4
    ) {
      diff += 1;
    }
  }
  return diff;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForDevToolsWs(chromeProc) {
  let stderrBuf = '';
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for Chromium DevTools URL. stderr:\n${stderrBuf}`));
    }, 15000);
    chromeProc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    chromeProc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited early (${code}). stderr:\n${stderrBuf}`));
    });
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          if (msg.error) entry.reject(new Error(msg.error.message));
          else entry.resolve(msg.result);
        }
      } else if (msg.method) {
        const list = this.listeners.get(msg.method) || [];
        for (const fn of list) fn(msg.params);
      }
    });
  }

  on(method, fn) {
    const list = this.listeners.get(method) || [];
    list.push(fn);
    this.listeners.set(method, list);
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const pkgJs = path.join(WEB_DIR, 'pkg', 'playground.js');
  if (!fs.existsSync(pkgJs)) {
    throw new Error(`Missing wasm-bindgen output at ${pkgJs}`);
  }

  const chromeBin = findChrome();
  const { server, port } = await startStaticServer(WEB_DIR);
  const chromeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--window-size=1280,800',
    '--remote-debugging-port=0',
    'about:blank',
  ];
  const chromeProc = spawn(chromeBin, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  const errors = [];
  const consoleLogs = [];

  try {
    const browserWsUrl = await waitForDevToolsWs(chromeProc);
    const browserPort = new URL(browserWsUrl).port;
    const targetsResp = await fetch(`http://127.0.0.1:${browserPort}/json/list`);
    const targets = await targetsResp.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error(`No inspectable page target found: ${JSON.stringify(targets)}`);
    }

    const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params?.exceptionDetails?.exception?.description || params?.exceptionDetails?.text || 'exception';
      errors.push(`Runtime.exceptionThrown: ${desc}`);
    });
    cdp.on('Runtime.consoleAPICalled', (params) => {
      const text = (params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      consoleLogs.push(`[console.${params.type}] ${text}`);
      if (params.type === 'error') {
        errors.push(`console.error: ${text}`);
      }
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });

    // Wait for wasm init + graphics init + ResizeObserver sizing canvas to 1280x800
    let ready = false;
    let lastState = null;
    for (let i = 0; i < 80; i += 1) {
      const evalRes = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          ready: Boolean(window.__playgroundReady),
          err: window.__playgroundError,
          bodyText: (document.body && document.body.innerText || '').trim(),
          canvasCount: document.querySelectorAll('canvas').length,
          canvasRect: (() => {
            const c = document.querySelector('canvas');
            if (!c) return null;
            const r = c.getBoundingClientRect();
            return { w: r.width, h: r.height, cw: c.width, ch: c.height };
          })()
        })`,
        returnByValue: true,
      });
      const state = JSON.parse(evalRes.result.value);
      lastState = state;
      if (state.err) throw new Error(`Wasm init error: ${state.err}`);
      if (state.bodyText && state.bodyText.length > 0) {
        throw new Error(`Browser page reported error text: ${state.bodyText}\nLogs: ${consoleLogs.join('\n')}`);
      }
      if (
        state.ready &&
        state.canvasCount > 0 &&
        state.canvasRect &&
        state.canvasRect.cw >= 1200 &&
        state.canvasRect.ch >= 700
      ) {
        ready = true;
        break;
      }
      await sleep(250);
    }
    if (!ready) {
      throw new Error(
        `Timed out waiting for Wasm canvas to mount at 1280x800. lastState=${JSON.stringify(lastState)} Errors=${errors.join('; ')} Logs=${consoleLogs.join(' | ')}`,
      );
    }

    // Wait for SwiftShader WebGL2 first frame paint (compile + draw can take >1s)
    let png1 = null;
    let img1 = null;
    let pillDark = 0;
    let titleDark = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(300);
      const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
      png1 = Buffer.from(shot1.data, 'base64');
      img1 = decodePngRgba(png1);
      pillDark = countDarkInkPixels(img1, 547, 8, 733, 44);
      titleDark = countDarkInkPixels(img1, 168, 100, 900, 260);
      if (pillDark >= 40 && titleDark >= 200) {
        break;
      }
    }
    fs.mkdirSync(path.dirname(args.outPage), { recursive: true });
    fs.writeFileSync(args.outPage, png1);

    // Assert actual dark ink glyph pixels exist in the mode pill and title regions
    console.log(`Web Wasm Page render: ${img1.width}x${img1.height}, pillDarkPx=${pillDark}, titleDarkPx=${titleDark}`);
    if (pillDark < 40) {
      throw new Error(
        `Expected rendered glyph pixels inside mode-switcher pill (>=40), got ${pillDark}. state=${JSON.stringify(lastState)} logs=${consoleLogs.join(' | ')}`,
      );
    }
    if (titleDark < 200) {
      throw new Error(
        `Expected rendered glyph pixels inside title/body region (>=200), got ${titleDark}. state=${JSON.stringify(lastState)} logs=${consoleLogs.join(' | ')}`,
      );
    }

    // Click "Edgeless" segment (pill centered at x=640, w=186 -> pill_x=547; edgeless x=548+94..548+180 -> center=685, y=26)
    const clickX = 685;
    const clickY = 26;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clickX, y: clickY, button: 'none' });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
    await sleep(600);

    const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const png2 = Buffer.from(shot2.data, 'base64');
    fs.mkdirSync(path.dirname(args.outEdgeless), { recursive: true });
    fs.writeFileSync(args.outEdgeless, png2);
    const img2 = decodePngRgba(png2);

    const diffPx = countDifferentPixels(img1, img2);
    console.log(`Web Wasm Edgeless click diffPixels=${diffPx}`);
    if (diffPx < 5000) {
      throw new Error(`Clicking Edgeless did not produce expected visual transition (diffPixels=${diffPx})`);
    }
    if (errors.length > 0) {
      throw new Error(`Uncaught browser errors during Wasm smoke test:\n${errors.join('\n')}`);
    }

    cdp.close();
    console.log('Web Wasm Chromium smoke test PASSED.');
  } finally {
    chromeProc.kill('SIGKILL');
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
