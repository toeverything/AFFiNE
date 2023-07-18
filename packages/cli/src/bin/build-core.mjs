#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawnSync(
  process.execPath,
  [
    '--loader',
    'ts-node/esm/transpile-only',
    fileURLToPath(new URL('./build-core.ts', import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' }
);

if (child.status) process.exit(child.status);
