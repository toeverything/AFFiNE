#!/usr/bin/env node
/**
 * Regenerates `tests/fixtures/katex_v0275_metrics.json` from the repository's
 * pinned `katex` package (0.18.10 in 0.27.5 yarn.lock) using real headless
 * Chromium with `katex.min.css` and bundled `.woff2` fonts for `width_em`
 * measurements alongside `katex.__renderToDomTree` vertical box metrics.
 *
 * Usage:
 *   node blocksuite/crates/preview/scripts/gen-katex-fixture.mjs
 *
 * Optional env vars:
 *   KATEX_MODULE_PATH        Path to a `katex` package directory
 *   PLAYWRIGHT_MODULE_PATH   Path to `playwright` or `playwright-core`
 *   CHROMIUM_EXECUTABLE_PATH Path to an existing Chrome/Chromium binary
 */
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  __dirname,
  '../tests/fixtures/katex_v0275_metrics.json'
);
const require = createRequire(import.meta.url);

const katexPkgPath = process.env.KATEX_MODULE_PATH
  ? path.resolve(process.env.KATEX_MODULE_PATH)
  : path.dirname(require.resolve('katex/package.json'));
const katex = require(katexPkgPath);
const katexDistDir = path.join(katexPkgPath, 'dist');

function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE_PATH) {
    return require(process.env.PLAYWRIGHT_MODULE_PATH);
  }
  for (const mod of ['playwright', 'playwright-core']) {
    try {
      return require(mod);
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(
    'Playwright is required (set PLAYWRIGHT_MODULE_PATH or install in workspace).'
  );
}

function resolveChromiumExecutable() {
  const candidates = [
    process.env.CHROMIUM_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
  if (filePath.endsWith('.woff')) return 'font/woff';
  if (filePath.endsWith('.ttf')) return 'font/ttf';
  return 'text/html; charset=utf-8';
}

function startStaticServer(rootDir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      if (reqPath === '/' || reqPath === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="/katex.min.css" />
  <style>
    body { margin: 0; padding: 16px; background: #fff; }
    #stage { font-size: 64px; line-height: 1; }
    .probe-inline { display: inline-block; white-space: nowrap; }
    .probe-display { display: block; width: 4000px; }
    .probe-display .katex-display > .katex > .katex-html { display: inline-block; }
  </style>
  <script src="/katex.min.js"></script>
</head>
<body><div id="stage"></div></body>
</html>`);
        return;
      }
      const safeRel = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
      const absPath = path.join(rootDir, safeRel);
      if (!absPath.startsWith(rootDir) || !fs.existsSync(absPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypeFor(absPath) });
      fs.createReadStream(absPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

const existing = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const { chromium } = loadPlaywright();
const { server, port } = await startStaticServer(katexDistDir);
const executablePath = resolveChromiumExecutable();
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});

try {
  const page = await browser.newPage({
    viewport: { width: 4200, height: 1200 },
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });

  // Measure every formula in real Chromium with KaTeX CSS + .woff2 fonts at 64px.
  const browserWidths = await page.evaluate(async items => {
    const stage = document.getElementById('stage');
    const nodes = [];
    for (const item of items) {
      const wrapper = document.createElement('div');
      wrapper.className = item.display_mode ? 'probe-display' : 'probe-inline';
      stage.appendChild(wrapper);
      try {
        window.katex.render(item.latex, wrapper, {
          displayMode: item.display_mode,
          strict: false,
          throwOnError: true,
        });
        nodes.push({ name: item.name, wrapper, ok: true });
      } catch {
        nodes.push({ name: item.name, wrapper, ok: false });
      }
    }
    await document.fonts.ready;
    const loadedFamilies = [...document.fonts]
      .filter(f => f.status === 'loaded')
      .map(f => f.family);
    if (!loadedFamilies.some(f => f.includes('KaTeX_Main'))) {
      throw new Error(
        `KaTeX_Main font did not load in Chromium: ${JSON.stringify(loadedFamilies)}`
      );
    }

    const widths = {};
    for (const entry of nodes) {
      if (!entry.ok) {
        widths[entry.name] = 0;
        continue;
      }
      const katexEl = entry.wrapper.querySelector('.katex') || entry.wrapper;
      const target = entry.wrapper.querySelector('.katex-html') || katexEl;
      const fontSizePx = parseFloat(getComputedStyle(katexEl).fontSize) || 64;
      const rect = target.getBoundingClientRect();
      widths[entry.name] = Number((rect.width / fontSizePx).toFixed(6));
    }
    return widths;
  }, existing.formulas);

  const formulas = existing.formulas.map(item => {
    try {
      const dom = katex.__renderToDomTree(item.latex, {
        displayMode: item.display_mode,
        strict: false,
        throwOnError: true,
      });
      return {
        name: item.name,
        latex: item.latex,
        display_mode: item.display_mode,
        katex_ok: true,
        height_em: Number(dom.height.toFixed(6)),
        depth_em: Number(dom.depth.toFixed(6)),
        width_em: browserWidths[item.name] ?? 0,
      };
    } catch {
      return {
        name: item.name,
        latex: item.latex,
        display_mode: item.display_mode,
        katex_ok: false,
        height_em: 0,
        depth_em: 0,
        width_em: 0,
      };
    }
  });

  const out = {
    katex_version: katex.version,
    count: formulas.length,
    formulas,
  };
  fs.writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `Wrote ${formulas.length} Chromium-measured formulas from katex@${katex.version} to ${fixturePath}`
  );
} finally {
  await browser.close();
  server.close();
}
