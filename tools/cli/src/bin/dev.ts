import { existsSync } from 'node:fs';
import { join } from 'node:path';

import * as p from '@clack/prompts';
import { config } from 'dotenv';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';

import { getCwdFromDistribution, projectRoot } from '../config/cwd.cjs';
import type { BuildFlags } from '../config/index.js';
import { watchI18N } from '../util/i18n.js';
import { createWebpackConfig } from '../webpack/webpack.config.js';

const flags: BuildFlags = {
  distribution:
    (process.env.DISTRIBUTION as BuildFlags['distribution']) ?? 'web',
  mode: 'development',
  static: false,
  channel: 'canary',
  coverage: process.env.COVERAGE === 'true',
};

const files = ['.env', '.env.local'];

for (const file of files) {
  if (existsSync(join(projectRoot, file))) {
    config({
      path: join(projectRoot, file),
    });
    console.log(`${file} loaded`);
    break;
  }
}

const buildFlags = process.argv.includes('--static')
  ? { ...flags, static: true }
  : ((await p.group(
      {
        distribution: () =>
          p.select({
            message: 'Distribution',
            options: [
              {
                value: 'web',
              },
              {
                value: 'desktop',
              },
              {
                value: 'admin',
              },
              {
                value: 'mobile',
              },
            ],
            initialValue: 'web',
          }),
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
    )) as BuildFlags);

flags.distribution = buildFlags.distribution;
flags.mode = buildFlags.mode;
flags.channel = buildFlags.channel;
flags.coverage = buildFlags.coverage;
flags.static = buildFlags.static;
flags.entry = undefined;

const cwd = getCwdFromDistribution(flags.distribution);

process.env.DISTRIBUTION = flags.distribution;

if (flags.distribution === 'desktop') {
  flags.entry = {
    app: join(cwd, 'index.tsx'),
    shell: join(cwd, 'shell/index.tsx'),
  };
}

console.info(flags);

if (!flags.static) {
  watchI18N();
}

try {
  // @ts-expect-error no types
  await import('@affine/templates/build-edgeless');
  const config = createWebpackConfig(cwd, flags);
  if (flags.static) {
    config.watch = false;
  }
  const compiler = webpack(config);
  // Start webpack
  const devServer = new WebpackDevServer(config.devServer, compiler);

  await devServer.start();
} catch (error) {
  console.error('Error during build:', error);
  process.exit(1);
}
