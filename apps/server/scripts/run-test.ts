#!/usr/bin/env ts-node-esm
import { resolve } from 'node:path';

import * as p from '@clack/prompts';
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import * as process from 'process';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testDir = resolve(root, 'src', 'tests');
const files = await readdir(testDir);

const args = [
  '--loader',
  'ts-node/esm.mjs',
  '--es-module-specifier-resolution',
  'node',
  '--test',
];

if (process.argv[2] === 'all') {
  spawn('node', [...args, resolve(testDir, '*')], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
    },
    stdio: 'inherit',
    shell: true,
  });
} else {
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

  spawn('node', [...args, target], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
    },
    stdio: 'inherit',
    shell: true,
  });
}
