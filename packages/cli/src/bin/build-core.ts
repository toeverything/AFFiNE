import { spawn } from 'node:child_process';
import path from 'node:path';

import type { BuildFlags } from '../config/index.js';
import { projectRoot } from '../config/index.js';

const cwd = path.resolve(projectRoot, 'apps', 'core');

const getChannel = () => {
  switch (process.env.BUILD_TYPE) {
    case 'canary':
    case 'beta':
    case 'stable':
    case 'internal':
      return process.env.BUILD_TYPE;
    default: {
      throw new Error(
        'BUILD_TYPE must be one of canary, beta, stable, internal'
      );
    }
  }
};

const flags = {
  distribution: 'browser',
  mode: 'production',
  channel: getChannel(),
  coverage: process.env.COVERAGE === 'true',
} satisfies BuildFlags;

spawn(
  'node',
  [
    '--loader',
    'ts-node/esm/transpile-only',
    '../../node_modules/webpack/bin/webpack.js',
    '--mode',
    'production',
    '--env',
    'flags=' + Buffer.from(JSON.stringify(flags), 'utf-8').toString('hex'),
  ].filter((v): v is string => !!v),
  {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  }
);
