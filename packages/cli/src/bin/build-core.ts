import { spawn } from 'node:child_process';
import path from 'node:path';

import type { BuildFlags } from '../config/index.js';
import { projectRoot } from '../config/index.js';
import { buildI18N } from '../util/i18n.js';

const cwd = path.resolve(projectRoot, 'apps', 'core');

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const buildType = process.env.BUILD_TYPE_OVERRIDE || process.env.BUILD_TYPE;

const getChannel = () => {
  switch (buildType) {
    case 'canary':
    case 'beta':
    case 'stable':
    case 'internal':
      return buildType;
    case '':
      throw new Error('BUILD_TYPE is not set');
    default: {
      throw new Error(
        `BUILD_TYPE must be one of canary, beta, stable, internal, received [${buildType}]`
      );
    }
  }
};

const getDistribution = () => {
  switch (process.env.DISTRIBUTION) {
    case 'browser':
    case 'desktop':
      return process.env.DISTRIBUTION;
    case undefined: {
      console.log('DISTRIBUTION is not set, defaulting to browser');
      return 'browser';
    }
    default: {
      throw new Error('DISTRIBUTION must be one of browser, desktop');
    }
  }
};

const flags = {
  distribution: getDistribution(),
  mode: 'production',
  channel: getChannel(),
  coverage: process.env.COVERAGE === 'true',
} satisfies BuildFlags;

buildI18N();
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
