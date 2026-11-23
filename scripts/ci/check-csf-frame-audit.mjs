#!/usr/bin/env node
// Zero-backend CSF geometry gate. Bundles the Frame Audit stories, lays them
// out in headless Chrome, and audits each frame with the Rust `frame-audit`
// engine. Every story must have no violations, and each corrupted copy of a
// real frame must report exactly the violations it was built to cause.
//
//   node scripts/ci/check-csf-frame-audit.mjs
//
// The browser is $CHROME_BIN, or google-chrome / chromium from PATH.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import swc from 'unplugin-swc';
import { build } from 'vite';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const COMPONENT = join(ROOT, 'packages/frontend/component');
const OUT = join(ROOT, '.artifacts/csf-frame-audit');
const ORIGIN = 'http://frame-audit.invalid';
const REQUIRED_STORIES = 7;

const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.avif': 'image/avif',
};

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of ['google-chrome', 'chromium']) {
      if (existsSync(join(dir, name))) return join(dir, name);
    }
  }
  throw new Error('no Chrome found: set CHROME_BIN');
}

async function bundleStories() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await build({
    configFile: false,
    root: COMPONENT,
    logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      vanillaExtractPlugin(),
      swc.vite({
        jsc: {
          parser: { syntax: 'typescript', tsx: true, decorators: true },
          target: 'es2022',
          transform: {
            react: { runtime: 'automatic' },
            useDefineForClassFields: false,
            decoratorVersion: '2022-03',
          },
        },
      }),
    ],
    build: {
      outDir: OUT,
      emptyOutDir: false,
      minify: false,
      cssCodeSplit: false,
      rollupOptions: {
        input: join(COMPONENT, 'src/ui/frame-audit/harness.tsx'),
        output: {
          format: 'es',
          inlineDynamicImports: true,
          entryFileNames: 'harness.js',
          assetFileNames: '[name][extname]',
        },
      },
    },
  });
}

async function captureFrames() {
  const browser = await chromium.launch({
    executablePath: findChrome(),
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Every request is answered from the bundle; nothing leaves the process.
    await page.route('**/*', route => {
      const { origin, pathname } = new URL(route.request().url());
      if (origin !== ORIGIN) return route.abort();
      if (pathname === '/') {
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html><head>
            <link rel="stylesheet" href="/style.css">
            <style>body{margin:0}</style>
            <script>globalThis.BUILD_CONFIG={isMobileEdition:false}</script>
            <script type="module" src="/harness.js"></script>
            </head><body></body></html>`,
        });
      }
      const file = join(OUT, pathname);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({
        contentType: MIME[extname(file)] ?? 'application/octet-stream',
        body: readFileSync(file),
      });
    });
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => 'captureFrameAuditStories' in window);
    const captured = await page.evaluate(
      cases => window.captureFrameAuditStories(cases),
      DOM_CASES
    );
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
    return captured;
  } finally {
    await browser.close();
  }
}

function audit(frames) {
  const input = join(OUT, 'frames.json');
  writeFileSync(input, JSON.stringify(frames));
  const result = spawnSync(
    'cargo',
    [
      'run',
      '--locked',
      '--quiet',
      '-p',
      'test-db-harness',
      '--bin',
      'affine-test-env',
      '--',
      'audit-frames',
      '--frames',
      input,
    ],
    {
      cwd: join(ROOT, 'packages/backend'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CARGO_ENCODED_RUSTFLAGS: '' },
    }
  );
  if (result.status !== 0) {
    throw new Error(`affine-test-env audit-frames failed:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

const NEGATIVE_CASES = [
  {
    name: 'button pushed past its clip',
    story: 'DialogFooter',
    corrupt: f => {
      f.elements['dialog.cancel'].bounds.x = 200;
    },
    expected: [['parent-clip-fault', 'dialog.cancel']],
  },
  {
    name: 'icon centered on the whole text block',
    story: 'FirstLineBaseline',
    corrupt: f => {
      f.elements['row.icon'].bounds.y += 12;
    },
    expected: [['first-line-baseline', 'row.icon']],
  },
  {
    name: 'footer wraps the primary action upward',
    story: 'DialogFooter',
    corrupt: f => {
      const { 'dialog.confirm': a, 'dialog.cancel': b } = f.elements;
      [a.bounds.y, b.bounds.y] = [b.bounds.y, a.bounds.y];
    },
    expected: [['footer-reverse-wrap', 'dialog.confirm']],
  },
  {
    name: 'inner radius above the concentric limit',
    story: 'NestedRadii',
    corrupt: f => {
      f.elements['card.inner'].corner_radius = 16;
    },
    expected: [['concentric-corner-radius', 'card.inner']],
  },
  {
    name: 'double divider after a hidden row',
    story: 'DividedList',
    corrupt: f => {
      f.elements['list.b'].opacity = 0;
    },
    expected: [['divider-placement', 'list.divider-c']],
  },
  {
    name: 'dangling divider after the last row',
    story: 'DividedList',
    corrupt: f => {
      f.elements['list.c'].opacity = 0;
    },
    expected: [['divider-placement', 'list.divider-c']],
  },
  {
    name: 'invisible button still takes the pointer',
    story: 'NarrowContainer',
    corrupt: f => {
      f.elements['narrow.action'].opacity = 0;
    },
    expected: [['zero-opacity-hit-through', 'narrow.action']],
  },
  {
    name: 'page content above the overlay',
    story: 'FloatingOverlay',
    corrupt: f => {
      for (const probe of f.hit_probes) probe.receiver = 'page.action';
    },
    expected: [['overlay-z-order', 'menu']],
  },
];

// Applied to the rendered element in the browser, then captured again.
const DOM_CASES = [
  {
    name: 'ellipsis degraded to clip',
    story: 'NarrowContainer',
    element: 'narrow.name',
    style: { textOverflow: 'clip' },
    expected: [['text-truncation', 'narrow.name']],
  },
  {
    name: 'fractional cell moved past its clip',
    story: 'FractionalThirds',
    element: 'thirds.c',
    style: { transform: 'translateX(400px)' },
    expected: [['parent-clip-fault', 'thirds.c']],
  },
];

const keyOf = ([rule, element]) => `${rule} @ ${element}`;
const keys = list => [...new Set(list.map(keyOf))].sort();

await bundleStories();
const { frames, domFrames } = await captureFrames();
const names = Object.keys(frames);
const problems = [];
if (names.length < REQUIRED_STORIES) {
  problems.push(`only ${names.length} stories captured`);
}
for (const [name, frame] of Object.entries(frames)) {
  if (Object.keys(frame.elements).length < 2) {
    problems.push(`${name}: no audited elements were captured`);
  }
}

// 470px in three cells only stays gap-free when each edge is snapped alone.
const thirds = ['a', 'b', 'c'].map(
  cell => frames.FractionalThirds.elements[`thirds.${cell}`].bounds.width
);
if (
  thirds.reduce((sum, width) => sum + width) !== 470 ||
  new Set(thirds).size < 2
) {
  problems.push(`FractionalThirds: unexpected widths ${thirds.join(', ')}`);
}

const inputs = { ...frames };
for (const { name } of DOM_CASES) {
  inputs[`negative: ${name}`] = domFrames[name];
}
for (const { name, story, corrupt } of NEGATIVE_CASES) {
  const copy = structuredClone(frames[story]);
  corrupt(copy);
  inputs[`negative: ${name}`] = copy;
}
const report = audit(inputs);

for (const name of names) {
  for (const v of report[name]) {
    problems.push(`${name}: ${v.rule} @ ${v.element_id}: ${v.message}`);
  }
}
for (const { name, expected } of [...NEGATIVE_CASES, ...DOM_CASES]) {
  const found = keys(
    report[`negative: ${name}`].map(v => [v.rule, v.element_id])
  );
  const want = keys(expected);
  if (found.join('\n') !== want.join('\n')) {
    problems.push(
      `negative "${name}": expected [${want.join(', ')}], got [${found.join(', ')}]`
    );
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`CSF frame audit: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(
  `CSF frame audit passed: ${names.length} stories clean, ${NEGATIVE_CASES.length + DOM_CASES.length} corrupted frames rejected`
);
