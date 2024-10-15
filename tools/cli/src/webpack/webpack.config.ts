import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import type { BuildFlags } from '@affine/cli/config';
import { Repository } from '@napi-rs/simple-git';
import HTMLPlugin from 'html-webpack-plugin';
import { once } from 'lodash-es';
import webpack from 'webpack';
import { merge } from 'webpack-merge';

import {
  createConfiguration,
  getPublicPath,
  rootPath,
  workspaceRoot,
} from './config.js';
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

  const publicPath = getPublicPath(flags);
  const selfhostPublicPath = publicPath.startsWith('/')
    ? publicPath
    : new URL(publicPath).pathname;
  const cdnOrigin = publicPath.startsWith('/')
    ? undefined
    : new URL(publicPath).origin;

  const templateParams = {
    GIT_SHORT_SHA: gitShortHash(),
    DESCRIPTION,
    PRECONNECT: cdnOrigin ? `<link rel="preconnect" href="${cdnOrigin}"` : '',
    VIEWPORT_FIT: flags.distribution === 'mobile' ? 'cover' : 'auto',
  };

  const htmlPluginOptions = {
    template: join(rootPath, 'webpack', 'template.html'),
    inject: 'body',
    filename: 'index.html',
    minify: false,
    templateParameters: templateParams,
    publicPath,
  } satisfies HTMLPlugin.Options;

  const createHTMLPlugins = (entryName: string) => {
    if (entryName === 'app') {
      return [
        new HTMLPlugin({
          ...htmlPluginOptions,
          templateParameters: (compilation, assets) => {
            const params = htmlPluginOptions.templateParameters;

            // emit assets manifest for ssr
            compilation.emitAsset(
              `assets-manifest.json`,
              new webpack.sources.RawSource(
                JSON.stringify(
                  {
                    ...assets,
                    publicPath,
                    selfhostPublicPath,
                    gitHash: params.GIT_SHORT_SHA,
                    description: params.DESCRIPTION,
                  },
                  null,
                  2
                )
              ),
              {
                immutable: true,
              }
            );

            return params;
          },
        }),
        // selfhost html
        new HTMLPlugin({
          ...htmlPluginOptions,
          publicPath: selfhostPublicPath,
          meta: {
            'env:isSelfHosted': 'true',
            'env:publicPath': selfhostPublicPath,
          },
          filename: 'selfhost.html',
          templateParameters: {
            ...htmlPluginOptions.templateParameters,
            PRECONNECT: '',
          },
        }),
      ];
    } else {
      return [
        new HTMLPlugin({
          ...htmlPluginOptions,
          filename: `${entryName}.html`,
        }),
      ];
    }
  };

  return merge(config, {
    entry,
    plugins: Object.keys(entry).map(createHTMLPlugins).flat(),
  });
}
