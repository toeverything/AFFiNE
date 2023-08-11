#!/usr/bin/env ts-node-esm
import { resolve } from 'node:path';

import * as p from '@clack/prompts';
import { spawn } from 'child_process';
import { readdir } from 'fs/promises';
import * as process from 'process';
import { fileURLToPath } from 'url';

import pkg from '../package.json' assert { type: 'json' };
const root = fileURLToPath(new URL('..', import.meta.url));
const testDir = resolve(root, 'src', 'tests');
const files = await readdir(testDir);

const watchMode = process.argv.includes('--watch');

const sharedArgs = [
  ...pkg.nodemonConfig.nodeArgs,
  '--test',
  watchMode ? '--watch' : '',
];

const env = {
  PATH: process.env.PATH,
  NODE_ENV: 'test',
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_NO_WARNINGS: '1',
};

if (process.argv[2] === 'all') {
  const cp = spawn('node', [...sharedArgs, resolve(testDir, '*')], {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: true,
  });
  cp.on('exit', code => {
    process.exit(code ?? 0);
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

  const cp = spawn(
    'node',
    [
      ...sharedArgs,
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      target,
    ],
    {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: true,
    }
  );
  cp.on('exit', code => {
    process.exit(code ?? 0);
  });
}
