#!/usr/bin/env node
// @ts-check

/**
 * Zero-dependency static gate for `packages/frontend/hosts/web/`.
 * Verifies zero third-party runtime JS imports, zero package manifests under
 * `packages/frontend/hosts/`, strict `index.html` CSP and DOM allowlist, and
 * strict iframe sandbox rules.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_HOSTS_ROOT = resolve(DEFAULT_WEB_ROOT, '..');
const TURNSTILE_ALLOWLIST_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * Recursively walks a directory tree and returns all file paths and matching
 * forbidden directory paths (`node_modules`).
 *
 * @param {string} rootDir
 * @returns {{ files: string[], nodeModulesDirs: string[] }}
 */
function walkTree(rootDir) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const nodeModulesDirs = [];
  if (!existsSync(rootDir)) {
    return { files, nodeModulesDirs };
  }
  /** @param {string} dir */
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') {
          nodeModulesDirs.push(full);
          continue;
        }
        visit(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  visit(rootDir);
  return { files, nodeModulesDirs };
}

/**
 * Strips block and line comments from JS source for static URL/import scanning.
 * Preserves URLs inside string literals by only removing full-line comments
 * and block comments.
 *
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Verifies zero third-party runtime JS and static allowlist invariants across
 * `packages/frontend/hosts/web/` and an optional staged output directory.
 *
 * @param {Object} [options]
 * @param {string} [options.webRoot]
 * @param {string} [options.hostsRoot]
 * @param {string | null} [options.stageDir]
 * @returns {{ ok: boolean, violations: string[], checkedFiles: number }}
 */
export function verifyZeroThirdPartyJs(options = {}) {
  const webRoot = resolve(options.webRoot || DEFAULT_WEB_ROOT);
  const hostsRoot = resolve(options.hostsRoot || DEFAULT_HOSTS_ROOT);
  const stageDir = options.stageDir ? resolve(options.stageDir) : null;

  /** @type {string[]} */
  const violations = [];
  let checkedFiles = 0;

  // 1. Zero package.json, yarn.lock, or node_modules under hosts/ and stageDir.
  const scanRoots = [hostsRoot];
  if (stageDir && existsSync(stageDir)) {
    scanRoots.push(stageDir);
  }
  for (const root of scanRoots) {
    const { files, nodeModulesDirs } = walkTree(root);
    for (const dir of nodeModulesDirs) {
      violations.push(`Forbidden node_modules directory: ${dir}`);
    }
    for (const file of files) {
      if (file.endsWith('/package.json') || file.endsWith('/yarn.lock')) {
        violations.push(`Forbidden package manifest: ${file}`);
      }
    }
  }

  // 2. Scan src/**/*.js (and any staged .js files) for bare imports and external script injection.
  const srcDir = join(webRoot, 'src');
  const jsFiles = walkTree(srcDir).files.filter(f => f.endsWith('.js'));
  if (stageDir && existsSync(stageDir)) {
    for (const file of walkTree(stageDir).files) {
      if (file.endsWith('.js') || file.endsWith('.mjs')) {
        jsFiles.push(file);
      }
    }
  }

  const staticImportRe =
    /(?:^|[;\n])\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const createScriptRe = /createElement\(\s*['"]script['"]\s*\)/g;
  const externalUrlRe = /https?:\/\/[^\s'"`<>)]+/g;

  for (const file of jsFiles) {
    checkedFiles += 1;
    const raw = readFileSync(file, 'utf8');
    const code = stripComments(raw);
    const rel = relative(webRoot, file);
    const stageRel = stageDir ? relative(stageDir, file) : '';
    const isSignIn = rel === 'src/sign-in.js' || stageRel === 'src/sign-in.js';

    for (const match of code.matchAll(staticImportRe)) {
      const specifier = match[1];
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        violations.push(
          `${rel}: bare or external static import "${specifier}" is forbidden`
        );
      }
    }

    for (const match of code.matchAll(dynamicImportRe)) {
      const specifier = match[1];
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        violations.push(
          `${rel}: bare or external dynamic import "${specifier}" is forbidden`
        );
      }
    }

    const createsScript = createScriptRe.test(code);
    createScriptRe.lastIndex = 0;
    if (createsScript && !isSignIn) {
      violations.push(
        `${rel}: dynamic <script> creation is only allowed in src/sign-in.js`
      );
    }

    if (isSignIn) {
      const urls = [...code.matchAll(externalUrlRe)].map(m => m[0]);
      for (const url of urls) {
        if (
          url !== TURNSTILE_ALLOWLIST_URL &&
          !url.startsWith('https://app.affine.pro')
        ) {
          violations.push(
            `${rel}: unexpected external URL "${url}" outside Turnstile allowlist`
          );
        }
      }
      if (
        !code.includes("'/api/auth/captcha'") &&
        !code.includes('"/api/auth/captcha"')
      ) {
        violations.push(
          `${rel}: Turnstile must be gated behind /api/auth/captcha`
        );
      }
    } else if (/\bsrc\s*=\s*['"]https?:\/\//.test(code)) {
      violations.push(
        `${rel}: external http(s) script/resource assignment is forbidden`
      );
    }
  }

  // 3. Scan HTML files for external <script src="http..."> tags.
  const htmlRoots = [webRoot];
  if (stageDir && existsSync(stageDir)) {
    htmlRoots.push(stageDir);
  }
  const externalScriptTagRe =
    /<script\b[^>]*\bsrc\s*=\s*['"]https?:\/\/[^'"]+['"][^>]*>/gi;
  for (const root of htmlRoots) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.html')) {
        continue;
      }
      const full = join(root, entry.name);
      checkedFiles += 1;
      const html = readFileSync(full, 'utf8');
      for (const match of html.matchAll(externalScriptTagRe)) {
        violations.push(
          `${entry.name}: static external script tag is forbidden (${match[0]})`
        );
      }
    }
  }

  // 4. Verify index.html CSP script-src and permanent visual DOM allowlist.
  const indexHtmlPath = join(webRoot, 'index.html');
  if (!existsSync(indexHtmlPath)) {
    violations.push('Missing index.html');
  } else {
    const indexHtml = readFileSync(indexHtmlPath, 'utf8');
    const cspMatch = indexHtml.match(
      /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i
    );
    if (!cspMatch) {
      violations.push('index.html: missing Content-Security-Policy meta tag');
    } else {
      const csp = cspMatch[1];
      const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/i);
      if (!scriptSrcMatch) {
        violations.push('index.html: CSP missing script-src directive');
      } else {
        const tokens = scriptSrcMatch[1].trim().split(/\s+/);
        const allowedScriptTokens = new Set(["'self'", "'wasm-unsafe-eval'"]);
        for (const token of tokens) {
          if (!allowedScriptTokens.has(token)) {
            violations.push(
              `index.html: forbidden CSP script-src token "${token}"`
            );
          }
        }
      }
    }

    const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<\/body>/i);
    if (!bodyMatch) {
      violations.push('index.html: missing <body>');
    } else {
      const body = bodyMatch[1];
      const tagIds = [
        ...body.matchAll(/<([a-z0-9-]+)\b[^>]*\bid="([^"]+)"/gi),
      ].map(m => `${m[1].toLowerCase()}#${m[2]}`);
      const allowedBodyIds = new Set([
        'canvas#app-canvas',
        'textarea#ime',
        'div#safe-area-probe',
        'div#embed-layer',
        'div#a11y-tree',
        'div#boot',
        'p#boot-message',
        'script#affine-build-manifest',
      ]);
      for (const tagId of tagIds) {
        if (!allowedBodyIds.has(tagId)) {
          violations.push(
            `index.html: unexpected DOM element "${tagId}" outside allowlist`
          );
        }
      }
      if (!tagIds.includes('canvas#app-canvas')) {
        violations.push('index.html: missing <canvas id="app-canvas">');
      }
      if (!tagIds.includes('textarea#ime')) {
        violations.push('index.html: missing <textarea id="ime">');
      }
      if (!body.includes('<div id="embed-layer"></div>')) {
        violations.push('index.html: #embed-layer must be empty at rest');
      }
      const probeMatches = body.match(/id="safe-area-probe"/g) || [];
      if (probeMatches.length > 1) {
        violations.push(
          'index.html: must contain at most one #safe-area-probe element'
        );
      }
    }
  }

  // 5. Verify host.js iframe sandbox allowlist strips allow-same-origin.
  const hostJsPath = join(webRoot, 'src/host.js');
  if (existsSync(hostJsPath)) {
    const hostCode = stripComments(readFileSync(hostJsPath, 'utf8'));
    const sandboxSetMatch = hostCode.match(
      /ALLOWED_SANDBOX_TOKENS\s*=\s*new Set\(\[([\s\S]*?)\]\)/
    );
    if (!sandboxSetMatch) {
      violations.push('src/host.js: missing ALLOWED_SANDBOX_TOKENS allowlist');
    } else if (sandboxSetMatch[1].includes('allow-same-origin')) {
      violations.push(
        'src/host.js: ALLOWED_SANDBOX_TOKENS must never include allow-same-origin'
      );
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    checkedFiles,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const stageDir = process.argv[2] ? resolve(process.argv[2]) : null;
  const report = verifyZeroThirdPartyJs({ stageDir });
  if (!report.ok) {
    console.error(
      `Zero-third-party-JS gate failed (${report.violations.length} violations):`
    );
    for (const v of report.violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }
  console.log(
    `Zero-third-party-JS gate passed (${report.checkedFiles} files verified, 0 violations)`
  );
}
