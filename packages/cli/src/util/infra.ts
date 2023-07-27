import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { build } from 'vite';

import { projectRoot } from '../config/index.js';

const infraFilePath = resolve(
  projectRoot,
  'packages',
  'infra',
  'vite.config.ts'
);
const pluginInfraFilePath = resolve(
  projectRoot,
  'packages',
  'plugin-infra',
  'vite.config.ts'
);

export const buildInfra = async () => {
  await build({
    configFile: infraFilePath,
  });
  await build({
    configFile: pluginInfraFilePath,
  });
};

export const watchInfra = async () => {
  spawn('vite', ['build', '--watch'], {
    cwd: resolve(projectRoot, 'packages', 'infra'),
    shell: true,
    stdio: 'inherit',
  });
  spawn('vite', ['build', '--watch'], {
    cwd: resolve(projectRoot, 'packages', 'plugin-infra'),
    shell: true,
    stdio: 'inherit',
  });
};
