import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..', '..', '..');
const cwd = path.resolve(root, 'packages', 'cli', 'src');

spawn('ts-node-esm', ['./scripts/octobase-service.ts'], {
  cwd,
  shell: true,
  stdio: 'inherit',
});
