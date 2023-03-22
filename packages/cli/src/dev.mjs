#!/usr/bin/env node
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
    server: () =>
      p.select({
        message: `Select dev server`,
        initialValue: 'local',
        options: [
          {
            value: 'local',
            label: 'local - 127.0.0.1:3000',
            hint: 'recommend',
          },
          { value: 'dev', label: 'dev - 100.84.105.99:11001' },
          {
            value: 'ac',
            label: 'ac - 100.85.73.88:12001',
          },
          {
            value: 'test',
            label: 'test - 100.84.105.99:11001',
          },
        ],
      }),
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

const env = {
  NODE_API_SERVER: dev.server,
  PATH: process.env.PATH,
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
      : envLocal.parsed.LOCAL_BLOCK_SUITE,
  });
  if (!fs.existsSync(localBlockSuite)) {
    throw new Error(`local blocksuite not found: ${localBlockSuite}`);
  }
  env.LOCAL_BLOCK_SUITE = localBlockSuite;
} else {
  env.LOCAL_BLOCK_SUITE = '';
}

if (dev.server === 'local') {
  console.log('You might need setup OctoBase dev server first.');
}

spawn('yarn', ['dev'], {
  env,
  cwd,
  stdio: 'inherit',
  shell: true,
});
