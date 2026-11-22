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
 *
 * `--query <string>` loads the page with a query string (for example a live room,
 * `room=<room>&ws=<ws_url>`), and `--min-title-ink <pixels>` raises the amount of ink
 * the title/body region must show before the page is captured, so a page that arrives
 * over the network is captured after it rendered.
 */

import { measureSurfaceBaselines } from './surface-baselines.mjs';
import assert from 'node:assert/strict';
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
    // Query string appended to the page URL, e.g. `room=<room>&ws=<ws_url>`.
    query: '',
    // Dark ink pixels required in the title/body region before the page is captured.
    minTitleInk: 200,
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) {
      args.outPage = path.resolve(argv[++i]);
    } else if (argv[i] === '--out-edgeless' && argv[i + 1]) {
      args.outEdgeless = path.resolve(argv[++i]);
    } else if (argv[i] === '--query' && argv[i + 1]) {
      args.query = argv[++i].replace(/^\?/, '');
    } else if (argv[i] === '--min-title-ink' && argv[i + 1]) {
      args.minTitleInk = Number(argv[++i]);
      if (!Number.isFinite(args.minTitleInk) || args.minTitleInk < 0) {
        throw new Error('--min-title-ink requires a non-negative number');
      }
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
    }, 45000);
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

async function launchChromiumWithRetry(chromeBin, chromeArgs) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const chromeProc = spawn(chromeBin, chromeArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'disabled:' },
    });
    try {
      const browserWsUrl = await waitForDevToolsWs(chromeProc);
      return { chromeProc, browserWsUrl };
    } catch (err) {
      lastErr = err;
      try {
        chromeProc.kill('SIGKILL');
      } catch {}
      if (attempt < 2) {
        console.warn(`Chromium startup attempt ${attempt} failed, retrying once: ${err.message}`);
        await sleep(500);
      }
    }
  }
  throw lastErr;
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

// Drive the page the way a person's pointer, keyboard and IME do, and read back the hidden
// textarea the browser's text input works on.
function inputProbe(cdp) {
  async function evaluate(expression) {
    const reply = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description);
    return reply.result.value;
  }
  const mirror = () => evaluate("Array.from(document.querySelectorAll('textarea')).map(t=>({value:t.value,offset:t.selectionStart,end:t.selectionEnd}))[0]");
  const mouse = (type, [x,y], buttons) => cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1,
  });
  const click = async point => {
    await mouse('mousePressed',point,1);
    await mouse('mouseReleased',point,0);
    await sleep(100);
    return mirror();
  };
  const waitValue = async value => {
    let state;
    for (let i=0;i<40;i++) {
      state = await mirror();
      if (state.value === value) return;
      await sleep(50);
    }
    const screenshot = path.join(ROOT, 'artifacts', 'web-smoke-failure.png');
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const png = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(screenshot, png);
    const toolbar = await evaluate(`({ focus: document.activeElement?.tagName,
      readOnly: document.querySelector('textarea')?.readOnly, atLink: document.elementFromPoint(387,216)?.tagName })`);
    toolbar.darkPixels = countDarkInkPixels(decodePngRgba(png), 200, 185, 525, 243);
    console.error({ screenshot, mirror: state, toolbar });
    throw new Error(`Expected mirrored text ${JSON.stringify(value)}, got ${JSON.stringify(state)}`);
  };
  const composition = (type,data) => evaluate(`document.querySelector('textarea').dispatchEvent(new CompositionEvent(${JSON.stringify(type)},{bubbles:true,data:${JSON.stringify(data)}}))`);
  // `modifiers: 2` is Control, the command modifier outside macOS.
  const key = async (key,code,windowsVirtualKeyCode,modifiers=0) => {
    for (const type of ['rawKeyDown','keyUp']) {
      await cdp.send('Input.dispatchKeyEvent',{type,key,code,modifiers,windowsVirtualKeyCode});
    }
  };
  return { evaluate, mirror, mouse, click, waitValue, composition, key };
}

// Exercise the browser input handler through the same hidden textarea a platform IME uses.
async function checkComposition(cdp) {
  const { mouse, click, waitValue, composition, key } = inputProbe(cdp);
  const undo = () => key('z','KeyZ',90,2);
  const first = [314,215], second = [331,254];
  const start = await click(first), end = await click(second);
  if (start.value !== 'Page mode' || !end.value.startsWith('This page')) {
    throw new Error(`Unable to select the two showcase blocks: ${JSON.stringify([start,end])}`);
  }
  for (const reverse of [false,true]) {
    const a = reverse ? second : first, b = reverse ? first : second;
    const original = reverse ? start : end;
    await mouse('mousePressed',a,1);
    await mouse('mouseMoved',b,1);
    await mouse('mouseReleased',b,0);
    await waitValue(original.value);
    await composition('compositionstart','');
    await composition('compositionupdate','ni');
    await sleep(75);
    await composition('compositionend','');
    await waitValue(original.value);
    // Cancellation must restore the directional document range for the next IME.
    await composition('compositionstart','');
    await composition('compositionupdate','nihao');
    await sleep(75);
    await composition('compositionend','你好');
    const joined = token => start.value.slice(0,start.offset) + token + end.value.slice(end.offset);
    await waitValue(joined('你好'));
    await undo();
    await waitValue(original.value);
    await cdp.send('Input.insertText',{text:'Z'});
    await waitValue(joined('Z'));
    await undo();
    await waitValue(original.value);
  }
  console.log('Forward and backward cross-block typing, IME cancellation, commit and undo passed');
}

// The formatting toolbar's link field is the text input while it is open: composition
// and paste go into the field, and the paragraph under the selection stays as it was.
async function checkLinkField(cdp) {
  const { evaluate, mirror, mouse, waitValue, composition, key } = inputProbe(cdp);
  // A few words on the first line of the second showcase block.
  const from = [331,254], to = [400,254];
  await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  await mouse('mousePressed',from,1);
  await mouse('mouseMoved',to,1);
  await mouse('mouseReleased',to,0);
  await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  await sleep(100);
  const paragraph = await mirror();
  if (!(paragraph.end > paragraph.offset + 3)) {
    throw new Error(`Link toolbar drag selected fewer than four characters: ${JSON.stringify(paragraph)}`);
  }
  if (!paragraph.value.startsWith('This page')) {
    throw new Error(`Unable to select in the second showcase block: ${JSON.stringify(paragraph)}`);
  }
  // The toolbar is 297 px wide and centered 46 px above the selected line; its sixth
  // button opens the link field, which then is what the hidden textarea mirrors.
  const link = [(from[0] + to[0]) / 2 - 148.5 + 170, 243 - 46 + 19];
  await mouse('mouseMoved',link,0);
  await mouse('mousePressed',link,1);
  await mouse('mouseReleased',link,0);
  await waitValue('');

  // A composition that is cancelled leaves the field empty; one that commits lands once.
  await composition('compositionstart','');
  await composition('compositionupdate','ni');
  await sleep(75);
  await composition('compositionend','');
  await waitValue('');
  await composition('compositionstart','');
  await composition('compositionupdate','nihao');
  await sleep(75);
  await composition('compositionend','你好');
  await waitValue('你好');

  // The paste key keeps its default action, so the browser follows it with a `paste`
  // event, and that event's text goes into the field.
  await evaluate(`window.__pasteKeyPrevented = null;
    window.addEventListener('keydown', e => {
      if (e.key === 'v' && e.ctrlKey) window.__pasteKeyPrevented = e.defaultPrevented;
    })`);
  await key('v','KeyV',86,2);
  const prevented = await evaluate('window.__pasteKeyPrevented');
  if (prevented !== false) {
    throw new Error(`Ctrl+V in the link field must keep its default action, defaultPrevented=${prevented}`);
  }
  const ignored = await evaluate(`(() => {
    const data = new DataTransfer();
    data.setData('text/plain', '.affine.pro');
    return document.querySelector('textarea').dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  })()`);
  if (ignored) throw new Error('The paste event was not taken by the link field');
  await waitValue('你好.affine.pro');

  // Closing the field hands the text input back to the paragraph, untouched.
  await key('Escape','Escape',27);
  await waitValue(paragraph.value);
  console.log('Link field composition, paste and dismissal left the paragraph untouched');
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
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--window-size=1280,800',
    '--remote-debugging-port=0',
    'about:blank',
  ];
  const { chromeProc, browserWsUrl } = await launchChromiumWithRetry(chromeBin, chromeArgs);
  const errors = [];
  const consoleLogs = [];

  try {
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

    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp.send('Page.bringToFront');
    const pageUrl = `http://127.0.0.1:${port}/${args.query ? `?${args.query}` : ''}`;
    await cdp.send('Page.navigate', { url: pageUrl });

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
      if (pillDark >= 40 && titleDark >= args.minTitleInk) {
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
    if (titleDark < args.minTitleInk) {
      throw new Error(
        `Expected rendered glyph pixels inside title/body region (>=${args.minTitleInk}), got ${titleDark}. state=${JSON.stringify(lastState)} logs=${consoleLogs.join(' | ')}`,
      );
    }

    if (!args.query) {
      await checkComposition(cdp);
      await checkLinkField(cdp);
      const baselines = await measureSurfaceBaselines(inputProbe(cdp).evaluate);
      assert.deepEqual(baselines, JSON.parse(fs.readFileSync(path.join(ROOT, 'tokens/surface-baselines.json'), 'utf8')));
      console.log('Chromium DOM and Canvas surface label baselines passed');
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
    const edgelessInk = countDarkInkPixels(img2, 40, 80, 1240, 760);
    console.log(`Web Wasm Edgeless canvas ink=${edgelessInk}`);
    if (edgelessInk < 500) {
      throw new Error(`Expected non-trivial Edgeless canvas ink (>=500), got ${edgelessInk}`);
    }

    if (!args.query) {
      // Exercise Edgeless bottom creation toolbar: select Shape tool (`s`) and drag a new shape on canvas.
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 400, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 400, button: 'left', clickCount: 1 });
      await sleep(100);
      for (const type of ['rawKeyDown', 'keyUp']) {
        await cdp.send('Input.dispatchKeyEvent', { type, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 });
      }
      await sleep(100);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 520, y: 300, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 680, y: 400, button: 'left', buttons: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 680, y: 400, button: 'left', clickCount: 1 });
      await sleep(300);
      const shotShape = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const imgShape = decodePngRgba(Buffer.from(shotShape.data, 'base64'));
      const shapeDiff = countDifferentPixels(img2, imgShape);
      console.log(`Web Wasm Edgeless shape creation diffPixels=${shapeDiff}`);
      if (shapeDiff < 100) {
        throw new Error(`Edgeless shape creation produced insufficient visual change (${shapeDiff})`);
      }

      // Also verify direct `?mode=edgeless` cold load without WebGL2/WebGPU shader errors.
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?mode=edgeless` });
      let edgelessDirectInk = 0;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await sleep(300);
        const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const img3 = decodePngRgba(Buffer.from(shot3.data, 'base64'));
        edgelessDirectInk = countDarkInkPixels(img3, 40, 80, 1240, 760);
        if (edgelessDirectInk >= 500) break;
      }
      console.log(`Web Wasm direct ?mode=edgeless ink=${edgelessDirectInk}`);
      if (edgelessDirectInk < 500) {
        throw new Error(`Direct ?mode=edgeless rendered insufficient ink (${edgelessDirectInk})`);
      }
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
