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
    (process.env.DISTRIBUTION as BuildFlags['distribution']) ?? 'browser',
  mode: 'development',
  channel: 'canary',
  coverage: process.env.COVERAGE === 'true',
  localBlockSuite: undefined,
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
  ? { ...flags, debugBlockSuite: false }
  : ((await p.group(
      {
        distribution: () =>
          p.select({
            message: 'Distribution',
            options: [
              {
                value: 'browser',
              },
              {
                value: 'desktop',
              },
              {
                value: 'admin',
              },
            ],
            initialValue: 'browser',
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
    )) as BuildFlags & { debugBlockSuite: boolean });

flags.distribution = buildFlags.distribution;
flags.mode = buildFlags.mode;
flags.channel = buildFlags.channel;
flags.coverage = buildFlags.coverage;
flags.entry = undefined;

const cwd = getCwdFromDistribution(flags.distribution);

process.env.DISTRIBUTION = flags.distribution;

if (flags.distribution === 'desktop') {
  flags.entry = {
    app: join(cwd, 'index.tsx'),
    shell: join(cwd, 'shell/index.tsx'),
  };
}

if (buildFlags.debugBlockSuite) {
  const { config } = await import('dotenv');
  const envLocal = config({
    path: join(cwd, '.env.local'),
  });

  const localBlockSuite = await p.text({
    message: 'local blocksuite PATH',
    initialValue: envLocal.error
      ? undefined
      : envLocal.parsed?.LOCAL_BLOCK_SUITE,
  });
  if (typeof localBlockSuite !== 'string') {
    throw new Error('local blocksuite PATH is required');
  }
  if (!existsSync(localBlockSuite)) {
    throw new Error(`local blocksuite not found: ${localBlockSuite}`);
  }
  flags.localBlockSuite = localBlockSuite;
}

console.info(flags);

watchI18N();

try {
  // @ts-expect-error no types
  await import('@affine/templates/build-edgeless');
  const config = createWebpackConfig(cwd, flags);
  const compiler = webpack(config);
  // Start webpack
  const devServer = new WebpackDevServer(config.devServer, compiler);

  await devServer.start();
} catch (error) {
  console.error('Error during build:', error);
  process.exit(1);
}
