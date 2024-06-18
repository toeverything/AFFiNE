import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { build } from 'vite';

import { projectRoot } from '../config/cwd.cjs';

const infraFilePath = resolve(
  projectRoot,
  'packages',
  'infra',
  'vite.config.ts'
);
export const buildInfra = async () => {
  await build({
    configFile: infraFilePath,
  });
};

export const watchInfra = async () => {
  spawn('vite', ['build', '--watch'], {
    cwd: resolve(projectRoot, 'packages/common/infra'),
    shell: true,
    stdio: 'inherit',
  });
};
