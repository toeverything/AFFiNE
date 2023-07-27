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
  await build({
    configFile: infraFilePath,
    build: {
      watch: {},
    },
  });
  await build({
    configFile: pluginInfraFilePath,
    build: {
      watch: {},
    },
  });
};
