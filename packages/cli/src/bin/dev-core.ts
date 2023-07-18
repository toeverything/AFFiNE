import { spawn } from 'node:child_process';
import path from 'node:path';

import * as p from '@clack/prompts';

import { type BuildFlags, projectRoot } from '../config/index.js';

const cwd = path.resolve(projectRoot, 'apps', 'core');

const flags: BuildFlags = {
  distribution: 'browser',
  mode: 'development',
  channel: 'canary',
  coverage: false,
};

const buildFlags = await p.group(
  {
    mode: () =>
      p.select({
        message: 'Mode',
        options: [
          {
            value: 'development',
          },
          {
            value: 'production',
          },
        ],
        initialValue: 'development',
      }),
    channel: () =>
      p.select({
        message: 'Channel',
        options: [
          {
            value: 'canary',
          },
          {
            value: 'beta',
          },
          {
            value: 'stable',
          },
        ],
        initialValue: 'canary',
      }),
    coverage: () =>
      p.confirm({
        message: 'Enable coverage',
        initialValue: process.env.COVERAGE === 'true',
      }),
  },
  {
    onCancel: () => {
      p.cancel('Operation cancelled.');
      process.exit(0);
    },
  }
);

flags.mode = buildFlags.mode as any;
flags.channel = buildFlags.channel as any;
flags.coverage = buildFlags.coverage;

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
    env: process.env,
  }
);
