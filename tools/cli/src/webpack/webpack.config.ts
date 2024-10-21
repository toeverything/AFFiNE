import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import type { BuildFlags } from '@affine/cli/config';
import { Repository } from '@napi-rs/simple-git';
import HTMLPlugin from 'html-webpack-plugin';
import { once } from 'lodash-es';
import type { Compiler } from 'webpack';
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
  const cdnOrigin = publicPath.startsWith('/')
    ? undefined
    : new URL(publicPath).origin;

  const templateParams = {
    GIT_SHORT_SHA: gitShortHash(),
    DESCRIPTION,
    PRECONNECT: cdnOrigin
      ? `<link rel="preconnect" href="${cdnOrigin}" />`
      : '',
    VIEWPORT_FIT:
      flags.distribution === 'mobile' ||
      flags.distribution === 'ios' ||
      flags.distribution === 'android'
        ? 'cover'
        : 'auto',
  };

  const createHTMLPlugins = (entryName: string) => {
    const htmlPluginOptions = {
      template: join(rootPath, 'webpack', 'template.html'),
      inject: 'body',
      filename: 'index.html',
      minify: false,
      templateParameters: templateParams,
      chunks: [entryName],
    } satisfies HTMLPlugin.Options;

    if (entryName === 'app') {
      return [
        {
          apply(compiler: Compiler) {
            compiler.hooks.compilation.tap(
              'assets-manifest-plugin',
              compilation => {
                HTMLPlugin.getHooks(compilation).beforeAssetTagGeneration.tap(
                  'assets-manifest-plugin',
                  arg => {
                    if (!compilation.getAsset('assets-manifest.json')) {
                      compilation.emitAsset(
                        `assets-manifest.json`,
                        new webpack.sources.RawSource(
                          JSON.stringify(
                            {
                              ...arg.assets,
                              js: arg.assets.js.map(file =>
                                file.substring(arg.assets.publicPath.length)
                              ),
                              css: arg.assets.css.map(file =>
                                file.substring(arg.assets.publicPath.length)
                              ),
                              gitHash: templateParams.GIT_SHORT_SHA,
                              description: templateParams.DESCRIPTION,
                            },
                            null,
                            2
                          )
                        ),
                        {
                          immutable: false,
                        }
                      );
                    }

                    return arg;
                  }
                );
              }
            );
          },
        },
        new HTMLPlugin({
          ...htmlPluginOptions,
          publicPath,
          meta: {
            'env:publicPath': publicPath,
          },
        }),
        // selfhost html
        new HTMLPlugin({
          ...htmlPluginOptions,
          meta: {
            'env:isSelfHosted': 'true',
            'env:publicPath': '/',
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
