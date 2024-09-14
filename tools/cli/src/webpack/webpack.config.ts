import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import type { BuildFlags } from '@affine/cli/config';
import { Repository } from '@napi-rs/simple-git';
import HTMLPlugin from 'html-webpack-plugin';
import { once } from 'lodash-es';
import webpack from 'webpack';
import { merge } from 'webpack-merge';

import { createConfiguration, rootPath, workspaceRoot } from './config.js';
import { getBuildConfig } from './runtime-config.js';

const DESCRIPTION = `There can be more than Notion and Miro. AFFiNE is a next-gen knowledge base that brings planning, sorting and creating all together.`;

const gitShortHash = once(() => {
  const { GITHUB_SHA } = process.env;
  if (GITHUB_SHA) {
    return GITHUB_SHA.substring(0, 9);
  }
  const repo = new Repository(workspaceRoot);
  const shortSha = repo.head().target()?.substring(0, 9);
  if (shortSha) {
    return shortSha;
  }
  const sha = execSync(`git rev-parse --short HEAD`, {
    encoding: 'utf-8',
  }).trim();
  return sha;
});

export function createWebpackConfig(cwd: string, flags: BuildFlags) {
  console.log('build flags', flags);
  const runtimeConfig = getBuildConfig(flags);
  console.log('BUILD_CONFIG', runtimeConfig);
  const config = createConfiguration(cwd, flags, runtimeConfig);
  const entry =
    typeof flags.entry === 'string' || !flags.entry
      ? {
          app: flags.entry ?? resolve(cwd, 'src/index.tsx'),
        }
      : flags.entry;

  const createHTMLPlugin = (entryName = 'app') => {
    return new HTMLPlugin({
      template: join(rootPath, 'webpack', 'template.html'),
      inject: 'body',
      minify: false,
      chunks: [entryName],
      filename: `${entryName === 'app' ? 'index' : entryName}.html`, // main entry should take name index.html
      templateParameters: (compilation, assets) => {
        if (entryName === 'app') {
          // emit assets manifest for ssr
          compilation.emitAsset(
            `assets-manifest.json`,
            new webpack.sources.RawSource(
              JSON.stringify(
                {
                  ...assets,
                  gitHash: gitShortHash(),
                  description: DESCRIPTION,
                },
                null,
                2
              )
            ),
            {
              immutable: true,
            }
          );
        }
        return {
          GIT_SHORT_SHA: gitShortHash(),
          DESCRIPTION,
          PUBLIC_PATH: config.output?.publicPath,
          VIEWPORT_FIT: flags.distribution === 'mobile' ? 'cover' : 'auto',
        };
      },
    });
  };

  return merge(config, {
    entry: entry,
    plugins: Object.keys(entry).map(createHTMLPlugin),
  });
}
