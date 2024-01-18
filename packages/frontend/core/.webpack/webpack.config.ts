import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { once } from 'lodash-es';
import { merge } from 'webpack-merge';
import type { BuildFlags } from '@affine/cli/config';
import HTMLPlugin from 'html-webpack-plugin';

import { getRuntimeConfig } from './runtime-config.js';
import { createConfiguration, rootPath } from './config.js';

const DESCRIPTION = `There can be more than Notion and Miro. AFFiNE is a next-gen knowledge base that brings planning, sorting and creating all together.`;

const gitShortHash = once(() => {
  const { GITHUB_SHA } = process.env;
  if (GITHUB_SHA) {
    return GITHUB_SHA.substring(0, 9);
  }
  const sha = execSync(`git rev-parse --short HEAD`, {
    encoding: 'utf-8',
  }).trim();
  return sha;
});

export default async function (cli_env: any, _: any) {
  const flags: BuildFlags = JSON.parse(
    Buffer.from(cli_env.flags, 'hex').toString('utf-8')
  );
  console.log('build flags', flags);
  const runtimeConfig = getRuntimeConfig(flags);
  console.log('runtime config', runtimeConfig);
  const config = createConfiguration(flags, runtimeConfig);
  return merge(config, {
    entry: {
      app: resolve(rootPath, 'src/index.tsx'),
    },
    plugins: [
      new HTMLPlugin({
        template: join(rootPath, '.webpack', 'template.html'),
        inject: 'body',
        scriptLoading: 'module',
        minify: false,
        chunks: ['app'],
        filename: 'index.html',
        templateParameters: {
          GIT_SHORT_SHA: gitShortHash(),
          DESCRIPTION,
        },
      }),
    ],
  });
}
