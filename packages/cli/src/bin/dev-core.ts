import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import * as p from '@clack/prompts';
import { config } from 'dotenv';

import { type BuildFlags, projectRoot } from '../config/index.js';
import { watchI18N } from '../util/i18n.js';

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

const cwd = path.resolve(projectRoot, 'apps', 'core');

const flags: BuildFlags = {
  distribution: 'browser',
  mode: 'development',
  channel: 'canary',
  coverage: false,
};

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
  },
  {
    onCancel: () => {
      p.cancel('Operation cancelled.');
      process.exit(0);
    },
  }
);

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
