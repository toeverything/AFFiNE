import { createConfiguration, rootPath } from './config.js';
import { merge } from 'webpack-merge';
import { join, resolve } from 'node:path';
import type { BuildFlags } from '@affine/cli/config';
import { getRuntimeConfig } from './runtime-config.js';
import HTMLPlugin from 'html-webpack-plugin';

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
      'polyfill/ses': {
        import: resolve(rootPath, 'src/polyfill/ses.ts'),
      },
      plugin: {
        dependOn: ['polyfill/ses'],
        import: resolve(rootPath, 'src/bootstrap/register-plugins.ts'),
      },
      app: {
        chunkLoading: 'import',
        dependOn: ['polyfill/ses', 'plugin'],
        import: resolve(rootPath, 'src/index.tsx'),
      },
      '_plugin/index.test': {
        chunkLoading: 'import',
        dependOn: ['polyfill/ses', 'plugin'],
        import: resolve(rootPath, 'src/_plugin/index.test.tsx'),
      },
    },
    plugins: [
      new HTMLPlugin({
        template: join(rootPath, '.webpack', 'template.html'),
        inject: 'body',
        scriptLoading: 'module',
        minify: false,
        chunks: ['app', 'plugin', 'polyfill/ses'],
        filename: 'index.html',
      }),
      new HTMLPlugin({
        template: join(rootPath, '.webpack', 'template.html'),
        inject: 'body',
        scriptLoading: 'module',
        minify: false,
        chunks: ['_plugin/index.test', 'plugin', 'polyfill/ses'],
        filename: '_plugin/index.html',
      }),
    ],
  });
}
