import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BuildFlags } from '../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..', '..', '..', '..');
const cwd = path.resolve(root, 'apps', 'core');

const flags: BuildFlags = {
  distribution: 'browser',
  mode: 'development',
  channel: 'canary',
};

spawn(
  'node',
  [
    '--loader',
    'ts-node/esm/transpile-only',
    '../../node_modules/webpack/bin/webpack.js',
    '--progress',
    '--env',
    'flags=' + Buffer.from(JSON.stringify(flags), 'utf-8').toString('hex'),
  ],
  {
    cwd,
    stdio: 'inherit',
    shell: true,
  }
);
