import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import * as p from '@clack/prompts';
import { config } from 'dotenv';

import { type BuildFlags, projectRoot } from '../config/index.js';
import { watchI18N } from '../util/i18n.js';

const cwd = path.resolve(projectRoot, 'apps', 'core');

const flags: BuildFlags = {
  distribution: 'browser',
  mode: 'development',
  channel: 'canary',
  coverage: false,
  localBlockSuite: undefined,
};

if (process.argv.includes('--static')) {
  await awaitChildProcess(
    spawn(
      'node',
      [
        '--loader',
        'ts-node/esm/transpile-only',
        '../../node_modules/webpack/bin/webpack.js',
        'serve',
        '--mode',
        'development',
        '--env',
        'flags=' + Buffer.from(JSON.stringify(flags), 'utf-8').toString('hex'),
      ].filter((v): v is string => !!v),
      {
        cwd,
        stdio: 'inherit',
        shell: true,
        env: process.env,
      }
    )
  );
  process.exit(0);
}

const files = ['.env', '.env.local'];

for (const file of files) {
  if (existsSync(path.resolve(projectRoot, file))) {
    config({
      path: path.resolve(projectRoot, file),
    });
    console.log(`${file} loaded`);
    break;
  }
}

const buildFlags = await p.group(
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
);

if (buildFlags.debugBlockSuite) {
  const { config } = await import('dotenv');
  const envLocal = config({
    path: path.resolve(cwd, '.env.local'),
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

flags.distribution = buildFlags.distribution as any;
flags.mode = buildFlags.mode as any;
flags.channel = buildFlags.channel as any;
flags.coverage = buildFlags.coverage;

watchI18N();

function awaitChildProcess(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const handleExitCode = (code: number | null) => {
      if (code) {
        reject(
          new Error(
            `Child process at ${
              (child as any).cwd
            } fails: ${child.spawnargs.join(' ')}`
          )
        );
      } else {
        resolve(0);
      }
    };

    child.on('error', () => handleExitCode(child.exitCode));
    child.on('exit', code => handleExitCode(code));
  });
}

try {
  // Build:infra
  await awaitChildProcess(
    spawn('yarn', ['build:infra'], {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    })
  );

  // Build:plugins
  await awaitChildProcess(
    spawn('yarn', ['build:plugins'], {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    })
  );

  // Start webpack
  await awaitChildProcess(
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
    )
  );
} catch (error) {
  console.error('Error during build:', error);
  process.exit(1);
}
