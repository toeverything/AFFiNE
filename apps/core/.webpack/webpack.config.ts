import { createConfiguration, rootPath } from './config.js';
import { merge } from 'webpack-merge';
import { resolve } from 'node:path';

export default async function (_cli_env: any, _argv: any) {
  const config = createConfiguration();
  return merge(config, {
    entry: {
      index: resolve(rootPath, 'src/index.tsx'),
    },
  });
}
