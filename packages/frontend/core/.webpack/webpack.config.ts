import { createConfiguration, rootPath, getPublicPath } from './config.js';
import { merge } from 'webpack-merge';
import { join, resolve } from 'node:path';
import type { BuildFlags } from '@affine/cli/config';
import { getRuntimeConfig } from './runtime-config.js';
import HTMLPlugin from 'html-webpack-plugin';

import { gitShortHash } from './s3-plugin.js';

const DESCRIPTION = `There can be more than Notion and Miro. AFFiNE is a next-gen knowledge base that brings planning, sorting and creating all together.`;

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
      '_plugin/index.test': resolve(rootPath, 'src/_plugin/index.test.tsx'),
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
      new HTMLPlugin({
        template: join(rootPath, '.webpack', 'template.html'),
        inject: 'body',
        scriptLoading: 'module',
        minify: false,
        publicPath: getPublicPath(flags),
        chunks: ['_plugin/index.test'],
        filename: '_plugin/index.html',
        templateParameters: {
          GIT_SHORT_SHA: gitShortHash(),
          DESCRIPTION,
        },
      }),
    ],
  });
}
