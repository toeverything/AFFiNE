import { spawn } from 'node:child_process';
import path from 'node:path';

import type { BuildFlags } from '../config/index.js';
import { projectRoot } from '../config/index.js';

const cwd = path.resolve(projectRoot, 'apps', 'core');

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
    flags.mode === 'development' ? 'serve' : undefined,
    '--mode',
    flags.mode === 'development' ? 'development' : 'production',
    '--env',
    'flags=' + Buffer.from(JSON.stringify(flags), 'utf-8').toString('hex'),
  ].filter((v): v is string => !!v),
  {
    cwd,
    stdio: 'inherit',
    shell: true,
  }
);
