import { resolve } from 'node:path';

import { runCli } from '@magic-works/i18n-codegen';

import { projectRoot } from '../config/index.js';

const configPath = resolve(projectRoot, '.i18n-codegen.json');

export const watchI18N = () => {
  runCli(
    {
      config: configPath,
      watch: true,
    },
    error => {
      console.error(error);
    }
  );
};

export const buildI18N = () => {
  runCli(
    {
      config: configPath,
      watch: false,
    },
    error => {
      console.error(error);
      process.exit(1);
    }
  );
};
