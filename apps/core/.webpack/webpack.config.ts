import { createConfiguration, rootPath } from './config.js';
import { merge } from 'webpack-merge';
import { resolve } from 'node:path';
import type { BuildFlags } from '@affine/cli/config';

export default async function (cli_env: any, _: any) {
  const flags: BuildFlags = JSON.parse(
    Buffer.from(cli_env.flags, 'hex').toString('utf-8')
  );
  console.log('build flags', flags);
  const config = createConfiguration(flags);
  return merge(config, {
    entry: {
      index: resolve(rootPath, 'src/index.tsx'),
    },
  });
}
