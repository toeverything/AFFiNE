#!/usr/bin/env node
// Prints `--project <name>` arguments for every Vitest project of the root
// config that runs in Node with nothing but JS dependencies. Left out:
// browser-mode projects (they need Playwright browsers), the Electron project
// (it needs the Electron binary and the native addon, and is not under
// blocksuite/), and the projects in NEEDS_RUST_BINARIES. Exits non-zero when
// it finds no project, so a caller never runs an unfiltered `vitest run`.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Projects whose tests spawn compiled Rust binaries; native-playground.yml's
// js-room-coop job builds those binaries and runs them.
const NEEDS_RUST_BINARIES = new Set(['@blocksuite/playground']);

function* configs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* configs(path);
    else if (entry.name === 'vitest.config.ts') yield path;
  }
}

const projects = [
  join(ROOT, 'vitest.config.ts'),
  ...configs(join(ROOT, 'blocksuite')),
];
const names = [];
for (const config of projects) {
  const source = readFileSync(config, 'utf8');
  if (/\bbrowser\s*:\s*\{[^}]*\benabled\s*:\s*true/s.test(source)) continue;
  const explicit = /\btest\s*:\s*\{[^]*?\bname\s*:\s*'([^']+)'/.exec(source);
  const pkg = join(dirname(config), 'package.json');
  const name =
    explicit?.[1] ??
    (existsSync(pkg) ? JSON.parse(readFileSync(pkg, 'utf8')).name : null);
  if (!name) {
    console.error(`${relative(ROOT, config)}: cannot determine project name`);
    process.exit(1);
  }
  if (!NEEDS_RUST_BINARIES.has(name)) names.push(name);
}
if (names.length === 0) {
  console.error('no Node-only Vitest project found');
  process.exit(1);
}
process.stdout.write(names.map(n => `--project ${n}`).join(' ') + '\n');
