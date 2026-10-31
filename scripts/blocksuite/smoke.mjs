/**
 * Install the packed tarballs into a brand-new Vite + TypeScript app, then
 * typecheck it, build it and mount an editor in headless Chromium.
 *
 * The app deliberately has no special configuration: whatever a consumer
 * would need to add on top of a plain Vite project is a packaging defect.
 *
 * Usage:
 *   node scripts/blocksuite/smoke.mjs [--packs <dir>] [--app <dir>]
 *     [--skip-install] [--skip-browser] [--typescript <range>] [--vite <range>]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  capture,
  defaultPacksDir,
  loadManifest,
  logStep,
  mdTable,
  releaseDir,
  rootDir,
  writeReport,
} from './lib.mjs';

const { values } = parseArgs({
  options: {
    packs: { type: 'string', default: defaultPacksDir },
    app: { type: 'string', default: path.join(releaseDir, 'smoke-app') },
    'skip-install': { type: 'boolean', default: false },
    'skip-browser': { type: 'boolean', default: false },
    typescript: { type: 'string', default: '^6.0.0' },
    vite: { type: 'string', default: '^8.0.0' },
  },
});

const packsDir = path.resolve(values.packs);
const appDir = path.resolve(values.app);
const manifest = loadManifest(packsDir);
const localBin = name =>
  path.join(
    appDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name
  );

const smokeText = 'Hello from the packed tarballs';

const files = {
  'package.json': `${JSON.stringify(
    {
      name: 'blocksuite-smoke-app',
      private: true,
      type: 'module',
      scripts: {
        typecheck: 'tsc -p tsconfig.json',
        build: 'vite build',
      },
      dependencies: {
        ...Object.fromEntries(
          manifest.packages.map(pkg => [
            pkg.name,
            `file:${path.join(packsDir, pkg.file)}`,
          ])
        ),
        lit: '^3.2.0',
        yjs: '^13.6.0',
      },
      devDependencies: {
        typescript: values.typescript,
        vite: values.vite,
      },
    },
    null,
    2
  )}\n`,
  'tsconfig.json': `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: ['vite/client'],
        strict: true,
        skipLibCheck: true,
        isolatedModules: true,
        noEmit: true,
      },
      include: ['src'],
    },
    null,
    2
  )}\n`,
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BlockSuite smoke test</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
  'src/main.ts': `import { Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { effects } from '@blocksuite/integration-test/effects';
import { getTestStoreManager } from '@blocksuite/integration-test/store';
import { getTestViewManager } from '@blocksuite/integration-test/view';

effects();

async function main() {
  const workspace = new TestWorkspace();
  workspace.storeExtensions = getTestStoreManager().get('store');
  workspace.meta.initialize();

  const doc = workspace.createDoc();
  const store = doc.getStore();
  doc.load();
  const rootId = store.addBlock('affine:page', {
    title: new Text('Smoke test'),
  });
  store.addBlock('affine:surface', {}, rootId);
  const noteId = store.addBlock('affine:note', {}, rootId);
  store.addBlock(
    'affine:paragraph',
    { text: new Text(${JSON.stringify(smokeText)}) },
    noteId
  );

  const viewManager = getTestViewManager();
  const editor = document.createElement('affine-editor-container');
  editor.doc = store;
  editor.pageSpecs = viewManager.get('page');
  editor.edgelessSpecs = viewManager.get('edgeless');

  document.getElementById('app')?.append(editor);
  await editor.updateComplete;
  document.body.dataset.smokeStatus = 'ready';
}

main().catch(error => {
  console.error(error);
  document.body.dataset.smokeStatus = 'failed';
});
`,
};

const stages = [];
async function stage(name, fn) {
  logStep(name);
  const started = Date.now();
  try {
    const detail = await fn();
    stages.push({ name, status: 'passed', detail: detail ?? '', started });
    return true;
  } catch (error) {
    const message = String(error?.message ?? error);
    stages.push({ name, status: 'failed', detail: message, started });
    console.error(message);
    return false;
  }
}

function tail(text, lines = 40) {
  const all = text.trim().split('\n');
  return all.slice(Math.max(0, all.length - lines)).join('\n');
}

function head(text, lines = 40) {
  return text.trim().split('\n').slice(0, lines).join('\n');
}

function exec(name, cmd, args, options = {}) {
  const result = capture(cmd, args, {
    cwd: appDir,
    env: { NO_COLOR: '1', FORCE_COLOR: '0' },
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${name} failed (exit ${result.status}):\n${head(`${result.stdout}\n${result.stderr}`, 60)}`
    );
  }
  return result;
}

const scaffolded = await stage('Scaffold a clean Vite + TypeScript app', () => {
  if (!values['skip-install']) {
    fs.rmSync(appDir, { recursive: true, force: true });
  }
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(appDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return `${appDir} (typescript ${values.typescript}, vite ${values.vite})`;
});

const installed =
  scaffolded &&
  (values['skip-install']
    ? true
    : await stage('npm install the packed tarballs', () => {
        exec('npm install', 'npm', [
          'install',
          '--no-audit',
          '--no-fund',
          '--no-package-lock',
          '--loglevel=error',
        ]);
        const installedTs = JSON.parse(
          fs.readFileSync(
            path.join(appDir, 'node_modules/typescript/package.json'),
            'utf8'
          )
        ).version;
        const installedVite = JSON.parse(
          fs.readFileSync(
            path.join(appDir, 'node_modules/vite/package.json'),
            'utf8'
          )
        ).version;
        return `typescript ${installedTs}, vite ${installedVite}`;
      }));

// Typecheck and build are independent signals, so the build runs even when
// the typecheck fails.
if (installed) {
  await stage('tsc --noEmit in the app', () => {
    exec('tsc', localBin('tsc'), ['-p', 'tsconfig.json', '--pretty', 'false']);
    return 'no type errors';
  });
}

const built =
  installed &&
  (await stage('vite build', () => {
    const result = exec('vite build', localBin('vite'), [
      'build',
      '--logLevel',
      'warn',
    ]);
    const dist = path.join(appDir, 'dist');
    const assets = fs.existsSync(path.join(dist, 'assets'))
      ? fs.readdirSync(path.join(dist, 'assets'))
      : [];
    const js = assets.filter(file => file.endsWith('.js'));
    const size = js.reduce(
      (sum, file) => sum + fs.statSync(path.join(dist, 'assets', file)).size,
      0
    );
    const warnings = tail(result.stderr, 10);
    return `${js.length} JS chunk(s), ${(size / 1024 / 1024).toFixed(2)} MB${warnings ? `\n${warnings}` : ''}`;
  }));

function serve(dir) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.map': 'application/json',
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, 'index.html');
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] ?? 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => server.close(),
      });
    });
  });
}

if (built && !values['skip-browser']) {
  await stage('Mount an editor in headless Chromium', async () => {
    const browsersPath = path.join(
      rootDir,
      'node_modules',
      '.cache',
      'ms-playwright'
    );
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(browsersPath)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
    }
    const { chromium } = await import('playwright');
    const { url, close } = await serve(path.join(appDir, 'dist'));
    let browser;
    try {
      browser = await chromium.launch();
    } catch (error) {
      close();
      throw new Error(
        `Could not launch Chromium (run \`yarn playwright install chromium\` or pass --skip-browser):\n${error.message}`
      );
    }
    const pageErrors = [];
    const consoleErrors = [];
    try {
      const page = await browser.newPage();
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      await page.goto(url);
      await page.waitForSelector('body[data-smoke-status]', {
        timeout: 30_000,
      });
      const status = await page.evaluate(
        () => document.body.dataset.smokeStatus
      );
      if (status !== 'ready') {
        throw new Error(
          `editor bootstrap failed:\n${[...pageErrors, ...consoleErrors].join('\n')}`
        );
      }
      const paragraph = page.locator('affine-paragraph').first();
      await paragraph.waitFor({ timeout: 30_000 });
      const rendered = await paragraph.innerText();
      if (!rendered.includes(smokeText)) {
        throw new Error(
          `paragraph did not render the seeded text, got: ${JSON.stringify(rendered)}`
        );
      }
      await paragraph.locator('[contenteditable="true"]').first().click();
      await page.keyboard.press('End');
      await page.keyboard.type(' typed');
      await page.waitForFunction(
        () =>
          document
            .querySelector('affine-paragraph')
            ?.textContent?.includes('typed'),
        null,
        { timeout: 10_000 }
      );
      if (pageErrors.length > 0) {
        throw new Error(
          `uncaught errors in the page:\n${pageErrors.join('\n')}`
        );
      }
      return `editor mounted, seeded text rendered, typing works${
        consoleErrors.length > 0
          ? `\n${consoleErrors.length} console.error(s):\n${head(consoleErrors.join('\n'), 10)}`
          : ''
      }`;
    } finally {
      await browser.close();
      close();
    }
  });
} else if (built) {
  stages.push({
    name: 'Mount an editor in headless Chromium',
    status: 'skipped',
    detail: '--skip-browser',
    started: Date.now(),
  });
}

const failed = stages.filter(s => s.status === 'failed');
const icon = { passed: '✓', failed: '✗', skipped: '–' };
const report = [
  `### Smoke install: ${failed.length === 0 ? 'passed' : `failed at "${failed[0].name}"`}`,
  '',
  `${manifest.packages.length} tarballs installed into a plain Vite + TypeScript app (typescript ${values.typescript}, vite ${values.vite}).`,
  '',
  mdTable(
    ['Stage', 'Result', 'Details'],
    stages.map(s => [
      s.name,
      `${icon[s.status]} ${s.status}`,
      s.detail
        ? `<pre>${s.detail.replaceAll('<', '&lt;').slice(0, 2000)}</pre>`
        : '',
    ])
  ),
].join('\n');

writeReport(report, path.join(releaseDir, 'smoke-report.md'));

console.log('');
for (const s of stages) {
  console.log(`${icon[s.status]} ${s.name}`);
  if (s.detail) {
    console.log(
      s.detail
        .split('\n')
        .map(line => `    ${line}`)
        .join('\n')
    );
  }
}
console.log(`\nreport: ${path.join(releaseDir, 'smoke-report.md')}`);

if (failed.length > 0) {
  process.exit(1);
}
