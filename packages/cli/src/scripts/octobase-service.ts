#!/usr/bin/env ts-node-esm
import { spawn } from 'node:child_process';

import * as p from '@clack/prompts';

const containerName = 'affine-octobase-dev';

const dev = await p.group({
  mode: () =>
    p.select({
      message: 'Select mode',
      initialValue: 'start',
      options: [
        { label: 'Run OctoBase (first time)', value: 'run' },
        { label: 'Start OctoBase', value: 'start' },
        { label: 'Stop OctoBase', value: 'stop' },
        { label: 'Delete OctoBase', value: 'delete' },
        { label: 'Pull OctoBase image', value: 'pull' },
      ],
    }),
});

if (dev.mode === 'run') {
  spawn(
    'docker',
    [
      'run',
      '-it',
      '--env=SIGN_KEY=test123',
      '--env=RUST_LOG=debug',
      '--env=JWST_DEV=1',
      '--workdir=/app',
      `--name=${containerName}`,
      '-p 3000:3000',
      '-d',
      '--runtime=runc',
      'ghcr.io/toeverything/cloud-self-hosted:nightly-latest',
    ],
    {
      stdio: 'inherit',
      shell: true,
    }
  );
} else if (dev.mode === 'pull') {
  spawn(
    'docker',
    ['pull', 'ghcr.io/toeverything/cloud-self-hosted:nightly-latest'],
    {
      stdio: 'inherit',
      shell: true,
    }
  );
} else if (dev.mode === 'start') {
  spawn('docker', ['start', containerName], {
    stdio: 'inherit',
    shell: true,
  });
} else if (dev.mode === 'stop') {
  spawn('docker', ['stop', containerName], {
    stdio: 'inherit',
    shell: true,
  });
} else if (dev.mode === 'delete') {
  spawn('docker', ['rm', containerName], {
    stdio: 'inherit',
    shell: true,
  });
}
