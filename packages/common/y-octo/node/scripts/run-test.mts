#!/usr/bin/env ts-node-esm
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

import prompts from 'prompts';

import pkg from '../package.json' with { type: 'json' };
const root = fileURLToPath(new URL('..', import.meta.url));
const testDir = resolve(root, 'tests');
const files = await readdir(testDir);

const watchMode = process.argv.includes('--watch');

const sharedArgs = [
  ...pkg.sharedConfig.nodeArgs,
  '--test',
  watchMode ? '--watch' : '',
];

const env = {
  ...pkg.sharedConfig.env,
  PATH: process.env.PATH,
  NODE_ENV: 'test',
  NODE_NO_WARNINGS: '1',
};

if (process.argv[2] === 'all') {
  const cp = spawn(
    'node',
    [...sharedArgs, ...files.map(f => resolve(testDir, f))],
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
} else {
  const result = await prompts([
    {
      type: 'select',
      name: 'file',
      message: 'Select a file to run',
      choices: files.map(file => ({
        title: file,
        value: file,
      })),
      initial: 1,
    },
  ]);

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
