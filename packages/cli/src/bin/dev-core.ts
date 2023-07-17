import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..', '..', '..');
const cwd = path.resolve(root, 'apps', 'core');

spawn(
  'node',
  [
    '--loader',
    'ts-node/esm/transpile-only',
    '../../node_modules/webpack/bin/webpack.js',
    '--progress',
  ],
  {
    cwd,
    stdio: 'inherit',
    shell: true,
  }
);
