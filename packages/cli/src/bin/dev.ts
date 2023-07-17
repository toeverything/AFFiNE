#!/usr/bin/env ts-node-esm
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as p from '@clack/prompts';
import { spawnSync } from 'child_process';

import { projectRoot } from '../config/index.js';

const cwd = path.resolve(projectRoot, 'apps', 'web');

const dev = await p.group(
  {
    debugBlockSuite: () =>
      p.confirm({
        message: 'Debug blocksuite locally?',
        initialValue: false,
      }),
  },
  {
    onCancel: () => {
      p.cancel('Operation cancelled.');
      process.exit(0);
    },
  }
);

const env: Record<string, string> = {
  PATH: process.env.PATH ?? '',
  NODE_ENV: 'development',
  PORT: '8080',
};

if (dev.debugBlockSuite) {
  const { config } = await import('dotenv');
  const envLocal = config({
    path: path.resolve(cwd, '.env.local'),
  });

  const localBlockSuite = await p.text({
    message: 'local blocksuite PATH',
    initialValue: envLocal.error
      ? undefined
      : envLocal.parsed?.LOCAL_BLOCK_SUITE,
  });
  if (typeof localBlockSuite !== 'string') {
    throw new Error('local blocksuite PATH is required');
  }
  if (!fs.existsSync(localBlockSuite)) {
    throw new Error(`local blocksuite not found: ${localBlockSuite}`);
  }
  env.LOCAL_BLOCK_SUITE = localBlockSuite;
} else {
  env.LOCAL_BLOCK_SUITE = '';
}

const packages = ['infra', 'plugin-infra'];

spawnSync('nx', ['run-many', '-t', 'build', '-p', ...packages], {
  env,
  cwd,
  stdio: 'inherit',
  shell: true,
});

packages.forEach(pkg => {
  const cwd = path.resolve(projectRoot, 'packages', pkg);
  spawn('yarn', ['dev'], {
    env,
    cwd,
    stdio: 'inherit',
    shell: true,
  });
});

spawn('yarn', ['dev', '-p', '8080'], {
  env,
  cwd,
  stdio: 'inherit',
  shell: true,
});
