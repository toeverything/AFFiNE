#!/usr/bin/env ts-node-esm
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as p from '@clack/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..', '..', '..');
const cwd = path.resolve(root, 'apps', 'web');

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

spawn('nx', ['dev', '@affine/web'], {
  env,
  cwd,
  stdio: 'inherit',
  shell: true,
});
