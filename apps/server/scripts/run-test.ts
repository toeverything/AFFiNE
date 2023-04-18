#!/usr/bin/env ts-node-esm
import { resolve } from 'node:path';

import * as p from '@clack/prompts';
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testDir = resolve(root, 'src', 'tests');
const files = await readdir(testDir);

const result = await p.group({
  file: () =>
    p.select({
      message: 'Select a file to run',
      options: files.map(file => ({
        label: file,
        value: file as any,
      })),
    }),
});

const target = resolve(testDir, result.file);

spawn(
  'node',
  [
    '--loader',
    'ts-node/esm.mjs',
    '--es-module-specifier-resolution',
    'node',
    '--test',
    target,
  ],
  {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
    },
    stdio: 'pipe',
    shell: true,
  }
);
