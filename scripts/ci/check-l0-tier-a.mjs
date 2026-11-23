#!/usr/bin/env node
// L0 Tier A: static repository gates that need nothing but Node's standard
// library and finish in well under a second.
//
//   node scripts/ci/check-l0-tier-a.mjs                    check
//   node scripts/ci/check-l0-tier-a.mjs --update-baseline  rewrite the ratchet
//
// Gates:
//   1. packages/backend/ layering: server-domain crates never depend on compatibility
//      layers or transport frameworks.
//   2. packages/backend/ hygiene: no private keys, commercial prompts or private-edition
//      table references in the public workspace.
//   3. Test-debt ratchet: per-file counts of `waitForTimeout(` and `.skip`
//      may only go down; `*.skip.*` test files are not allowed at all.
//   4. Workflows: local `uses:` and dispatched workflow files exist, private
//      repository references stay in release workflows, and the native
//      playground workflows run on pinned runners and test images.
//   5. .gitignore ignores test output directories.

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const started = performance.now();
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BASELINE_PATH = join(ROOT, 'scripts/ci/l0-ratchet.json');
const updateBaseline = process.argv.includes('--update-baseline');

const errors = [];
const fail = (gate, message) => errors.push(`[${gate}] ${message}`);
const rel = path => relative(ROOT, path).split(sep).join('/');
const read = path => readFileSync(path, 'utf8');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'target',
  '.yarn',
  'test-results',
  'playwright-report',
  '.artifacts',
  '.coverage',
]);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// 1 + 2. packages/backend/ layering and hygiene -----------------------------

const CRATES = join(ROOT, 'packages/backend');
const LEGACY_BACKEND_DIRS = new Set(['native', 'server']);
const DOMAIN_FORBIDDEN = [
  'legacy_compat',
  'phase_a_compat',
  'axum',
  'async-graphql',
  'async_graphql',
];
const HYGIENE_RULES = [
  [/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/, 'private key material'],
  [/\baffine_ee\./, 'private-edition table reference (affine_ee.)'],
  [/You are AFFiNE AI/, 'commercial prompt text'],
];

if (existsSync(CRATES)) {
  for (const file of walk(CRATES)) {
    const path = rel(file);
    const sub = path.slice('packages/backend/'.length).split('/')[0];
    if (LEGACY_BACKEND_DIRS.has(sub)) continue;
    if (/(^|\/)prompts\//.test(path))
      fail(
        'crates-hygiene',
        `${path}: prompt assets do not belong in packages/backend/`
      );
    if (statSync(file).size > 2 * 1024 * 1024) continue;
    const text = read(file);
    for (const [pattern, what] of HYGIENE_RULES) {
      const m = pattern.exec(text);
      if (m)
        fail('crates-hygiene', `${path}:${lineOf(text, m.index)}: ${what}`);
    }

    const domainCrate = /^packages\/backend\/server-domain[^/]*\//.test(path);
    if (domainCrate && path.endsWith('/Cargo.toml')) {
      const deps = text
        .split(/^\[/m)
        .filter(section =>
          /^(?:[\w.-]+\.)?(?:dev-|build-)?dependencies\b/.test(section)
        );
      for (const section of deps) {
        for (const name of DOMAIN_FORBIDDEN) {
          const m = new RegExp(
            `^\\s*${name.replace('-', '[-_]')}\\s*[=.]`,
            'm'
          ).exec(section);
          if (m)
            fail(
              'crates-layering',
              `${path}: server-domain must not depend on ${name}`
            );
        }
      }
    }
    if (domainCrate && path.endsWith('.rs')) {
      for (const name of DOMAIN_FORBIDDEN) {
        const m = new RegExp(
          `\\b(?:use|extern crate)\\s+(?:::)?${name.replace('-', '_')}\\b`
        ).exec(text);
        if (m)
          fail(
            'crates-layering',
            `${path}:${lineOf(text, m.index)}: server-domain must not use ${name}`
          );
      }
    }

    const httpCrate = path.startsWith('packages/backend/server-http/');
    if (httpCrate && path.endsWith('.rs')) {
      const nonTest = text
        .split(/#\[cfg\(test\)\]/)[0]
        .replace(/\/\/[^\n]*/g, '');
      const entMatch = /\b(?:FROM|JOIN)\s+(?:public\.)?entitlements\b/i.exec(
        nonTest
      );
      if (entMatch) {
        fail(
          'crates-layering',
          `${path}:${lineOf(nonTest, entMatch.index)}: server-http must not query entitlements directly; use BillingSubject on AccessGrant`
        );
      }
    }
  }
}

// 2b. packages/backend/AGENTS.md Rust type cross-check ----------------------

const BACKEND_AGENTS_MD = join(ROOT, 'packages/backend/AGENTS.md');
const AGENTS_TYPE_WHITELIST = new Set(['SessionRedis']);
if (existsSync(BACKEND_AGENTS_MD)) {
  const rsCorpus = [];
  for (const dir of [CRATES, join(ROOT, 'tools/frame-audit')]) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const path = rel(file);
      if (path.startsWith('packages/backend/')) {
        const sub = path.slice('packages/backend/'.length).split('/')[0];
        if (LEGACY_BACKEND_DIRS.has(sub)) continue;
      }
      if (!path.endsWith('.rs')) continue;
      const stripped = read(file).replace(/\/\/[^\n]*/g, '');
      rsCorpus.push(stripped);
    }
  }
  const combinedRs = rsCorpus.join('\n');
  const agentsText = read(BACKEND_AGENTS_MD);
  const checked = new Set();
  for (const m of agentsText.matchAll(/`([A-Z][A-Za-z0-9_]+)`/g)) {
    const token = m[1];
    if (/^[A-Z0-9_]+$/.test(token) || AGENTS_TYPE_WHITELIST.has(token)) {
      continue;
    }
    if (checked.has(token)) continue;
    checked.add(token);
    if (!new RegExp(`\\b${token}\\b`).test(combinedRs)) {
      fail(
        'docs-drift',
        `packages/backend/AGENTS.md:${lineOf(agentsText, m.index)}: Rust type \`${token}\` not found in packages/backend/ or tools/frame-audit/`
      );
    }
  }
}

// 3. Test-debt ratchet ------------------------------------------------------

const RATCHET_ROOTS = ['tests', 'packages', 'blocksuite', 'tools'];
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const RATCHETS = {
  waitForTimeout: /\bwaitForTimeout\s*\(/g,
  skip: /\b(?:test|it|describe|suite|bench)(?:\.\w+)*\.skip(?:If)?\b/g,
};

const counts = Object.fromEntries(Object.keys(RATCHETS).map(k => [k, {}]));
const hits = Object.fromEntries(Object.keys(RATCHETS).map(k => [k, {}]));
for (const top of RATCHET_ROOTS) {
  for (const file of walk(join(ROOT, top))) {
    if (!SOURCE_EXT.test(file)) continue;
    const path = rel(file);
    if (/\.skip\.[cm]?[jt]sx?$/.test(path)) {
      fail(
        'test-ratchet',
        `${path}: skipped test files are not allowed; delete it or make it run`
      );
    }
    const text = read(file);
    for (const [name, pattern] of Object.entries(RATCHETS)) {
      pattern.lastIndex = 0;
      const lines = [];
      for (let m; (m = pattern.exec(text));) lines.push(lineOf(text, m.index));
      if (lines.length) {
        counts[name][path] = lines.length;
        hits[name][path] = lines;
      }
    }
  }
}

const sorted = obj =>
  Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
const total = obj => Object.values(obj).reduce((a, b) => a + b, 0);

if (updateBaseline) {
  const baseline = Object.fromEntries(
    Object.entries(counts).map(([name, files]) => [
      name,
      { total: total(files), files: sorted(files) },
    ])
  );
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`wrote ${rel(BASELINE_PATH)}`);
} else {
  const baseline = existsSync(BASELINE_PATH)
    ? JSON.parse(read(BASELINE_PATH))
    : {};
  for (const [name, files] of Object.entries(counts)) {
    const allowed = baseline[name]?.files ?? {};
    for (const [path, count] of Object.entries(files)) {
      const max = allowed[path] ?? 0;
      if (count > max) {
        fail(
          'test-ratchet',
          `${path}: ${count} ${name} (ceiling ${max}) at lines ${hits[name][path].join(', ')}; remove the new ones`
        );
      }
    }
    for (const [path, max] of Object.entries(allowed)) {
      const count = files[path] ?? 0;
      if (count < max) {
        fail(
          'test-ratchet',
          `${path}: ${name} went down ${max} -> ${count}; run node scripts/ci/check-l0-tier-a.mjs --update-baseline to lower the ceiling`
        );
      }
    }
  }
}

// 4. Workflows --------------------------------------------------------------

const WORKFLOWS = join(ROOT, '.github/workflows');
const PRIVATE_REPO = /\baffine-native\b|\baffine[-_]ee\b/;
const PRIVATE_REPO_ALLOWED = new Set(['release-submit.yml']);
const PINNED_RUNNERS = new Set(['ubuntu-24.04', 'macos-15']);
// Fully qualified and pinned to multi-arch index digests, so Docker and
// Podman on every machine run the same bytes.
const PINNED_TEST_IMAGES = new Set([
  'docker.io/pgvector/pgvector:pg16@sha256:484e838076e04939d27d3e176e91c86eea96236126023be8d3059761122e579f',
  'docker.io/library/redis:7-alpine@sha256:7f7d30b7fdd09467bac58198a1f166dd69789d348d4fe859cccb20e0cf287fbe',
]);
const isNativePlayground = name =>
  name === 'native-playground.yml' || name.startsWith('np-');

for (const name of readdirSync(WORKFLOWS).filter(f => /\.ya?ml$/.test(f))) {
  const path = `.github/workflows/${name}`;
  const text = read(join(WORKFLOWS, name));
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const at = `${path}:${i + 1}`;
    const local = /uses:\s*['"]?\.\/(\.github\/[\w./-]+?)['"]?\s*$/.exec(line);
    if (local) {
      const target = join(ROOT, local[1]);
      const ok = local[1].startsWith('.github/workflows/')
        ? existsSync(target)
        : existsSync(join(target, 'action.yml')) ||
          existsSync(join(target, 'action.yaml'));
      if (!ok) fail('workflows', `${at}: ${local[1]} does not exist`);
    }
    const dispatched = /^\s*workflow:\s*['"]?([\w.-]+\.ya?ml)['"]?\s*$/.exec(
      line
    );
    if (dispatched && !existsSync(join(WORKFLOWS, dispatched[1]))) {
      fail('workflows', `${at}: dispatches missing workflow ${dispatched[1]}`);
    }
    if (PRIVATE_REPO.test(line) && !PRIVATE_REPO_ALLOWED.has(name)) {
      fail(
        'workflows',
        `${at}: private repository reference outside release workflows`
      );
    }
    if (isNativePlayground(name)) {
      const runner = /^\s*runs-on:\s*['"]?([^'"#\s]+)/.exec(line);
      if (
        runner &&
        !runner[1].startsWith('${{') &&
        !PINNED_RUNNERS.has(runner[1])
      ) {
        fail(
          'workflows',
          `${at}: runner ${runner[1]} is not one of ${[...PINNED_RUNNERS].join(', ')}`
        );
      }
      const image =
        /^\s*image:\s*['"]?([^'"#\s]+)/.exec(line) ??
        /\bdocker pull(?:\s+-\S+)*\s+([^\s&;|]+)/.exec(line);
      if (image && !PINNED_TEST_IMAGES.has(image[1])) {
        fail(
          'workflows',
          `${at}: test image ${image[1]} is not one of the pinned digests`
        );
      }
    }
  });
}

// The harness starts the same pinned images the workflows pull.
const HARNESS_IMAGES = [
  [
    'packages/backend/test-db-harness/src/pg.rs',
    /PG_IMAGE: &str =\s*"([^"]+)"/,
  ],
  [
    'packages/backend/test-db-harness/src/redis.rs',
    /REDIS_IMAGE: &str =\s*"([^"]+)"/,
  ],
];
for (const [path, pattern] of HARNESS_IMAGES) {
  if (!existsSync(join(ROOT, path))) continue;
  const m = pattern.exec(read(join(ROOT, path)));
  if (!m || !PINNED_TEST_IMAGES.has(m[1])) {
    fail(
      'workflows',
      `${path}: harness image ${m?.[1] ?? '(none)'} is not a pinned test image`
    );
  }
}

// 5. .gitignore -------------------------------------------------------------

const ignored = new Set(
  read(join(ROOT, '.gitignore'))
    .split('\n')
    .map(l => l.trim())
);
for (const dir of ['test-results/', '.artifacts/']) {
  if (!ignored.has(dir))
    fail('gitignore', `.gitignore must contain the line ${dir}`);
}

// ---------------------------------------------------------------------------

const ms = Math.round(performance.now() - started);
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`L0 Tier A: ${errors.length} problem(s) in ${ms} ms`);
  process.exit(1);
}
const summary = Object.entries(counts)
  .map(([name, files]) => `${name} ${total(files)}`)
  .join(', ');
console.log(`L0 Tier A passed in ${ms} ms (ratchet: ${summary})`);
