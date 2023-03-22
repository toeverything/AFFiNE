#!/usr/bin/env node
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as p from '@clack/prompts';
import os from 'os';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  },
  {
    onCancel: () => {
      p.cancel('Operation cancelled.');
      process.exit(0);
    },
  }
);

if (dev.server === 'local') {
  console.log('You might need setup OctoBase dev server first.');
}

const env = {
  NODE_API_SERVER: dev.server,
  PATH: process.env.PATH,
};

const root = path.resolve(__dirname, '..', '..', '..');
const cwd = path.resolve(root, 'apps', 'web');

spawn('yarn', ['dev'], {
  env,
  cwd,
  stdio: 'inherit',
  shell: true,
});
