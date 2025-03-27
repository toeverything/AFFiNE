import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { Path, ProjectRoot } from '@affine-tools/utils/path';
import { Repository } from '@napi-rs/simple-git';
import HTMLPlugin from 'html-webpack-plugin';
import once from 'lodash-es/once';
import type { Compiler, WebpackPluginInstance } from 'webpack';
import webpack from 'webpack';

import type { BuildFlags } from './types.js';

export const getPublicPath = (
  flags: BuildFlags,
  BUILD_CONFIG: BUILD_CONFIG_TYPE
) => {
  const { BUILD_TYPE } = process.env;
  if (typeof process.env.PUBLIC_PATH === 'string') {
    return process.env.PUBLIC_PATH;
  }

  if (
    flags.mode === 'development' ||
    BUILD_CONFIG.distribution === 'desktop' ||
    BUILD_CONFIG.distribution === 'ios' ||
    BUILD_CONFIG.distribution === 'android'
  ) {
    return '/';
  }

  switch (BUILD_TYPE) {
    case 'stable':
      return 'https://prod.affineassets.com/';
    case 'beta':
      return 'https://beta.affineassets.com/';
    default:
      return 'https://dev.affineassets.com/';
  }
};

const DESCRIPTION = `There can be more than Notion and Miro. AFFiNE is a next-gen knowledge base that brings planning, sorting and creating all together.`;

const gitShortHash = once(() => {
  const { GITHUB_SHA } = process.env;
  if (GITHUB_SHA) {
    return GITHUB_SHA.substring(0, 9);
  }
  const repo = new Repository(ProjectRoot.value);
  const shortSha = repo.head().target()?.substring(0, 9);
  if (shortSha) {
    return shortSha;
  }
  const sha = execSync(`git rev-parse --short HEAD`, {
    encoding: 'utf-8',
  }).trim();
  return sha;
});

const currentDir = Path.dir(import.meta.url);

function getHTMLPluginOptions(
  flags: BuildFlags,
  BUILD_CONFIG: BUILD_CONFIG_TYPE
) {
  const publicPath = getPublicPath(flags, BUILD_CONFIG);
  const cdnOrigin = publicPath.startsWith('/')
    ? undefined
    : new URL(publicPath).origin;

  const templateParams = {
    GIT_SHORT_SHA: gitShortHash(),
    DESCRIPTION,
    PRECONNECT: cdnOrigin
      ? `<link rel="preconnect" href="${cdnOrigin}" />`
      : '',
    VIEWPORT_FIT: BUILD_CONFIG.isMobileEdition ? 'cover' : 'auto',
  };

  return {
    template: currentDir.join('template.html').toString(),
    inject: 'body',
    filename: 'index.html',
    minify: false,
    templateParameters: templateParams,
    chunks: ['app'],
  } satisfies HTMLPlugin.Options;
}

export function createShellHTMLPlugin(
  flags: BuildFlags,
  BUILD_CONFIG: BUILD_CONFIG_TYPE
) {
  const htmlPluginOptions = getHTMLPluginOptions(flags, BUILD_CONFIG);

  return new HTMLPlugin({
    ...htmlPluginOptions,
    chunks: ['shell'],
    filename: `shell.html`,
  });
}

export function createBackgroundWorkerHTMLPlugin(
  flags: BuildFlags,
  BUILD_CONFIG: BUILD_CONFIG_TYPE
) {
  const htmlPluginOptions = getHTMLPluginOptions(flags, BUILD_CONFIG);

  return new HTMLPlugin({
    ...htmlPluginOptions,
    chunks: ['backgroundWorker'],
    filename: `background-worker.html`,
  });
}

export function createPopupHTMLPlugin(
  flags: BuildFlags,
  BUILD_CONFIG: BUILD_CONFIG_TYPE
) {
  const htmlPluginOptions = getHTMLPluginOptions(flags, BUILD_CONFIG);

  return new HTMLPlugin({
    ...htmlPluginOptions,
    chunks: ['popup'],
    filename: `popup.html`,
  });
}

export function createHTMLPlugins(
  flags: BuildFlags,
  BUILD_CONFIG: BUILD_CONFIG_TYPE
): WebpackPluginInstance[] {
  const publicPath = getPublicPath(flags, BUILD_CONFIG);
  const globalErrorHandler = [
    'js/global-error-handler.js',
    readFileSync(currentDir.join('./error-handler.js').toString(), 'utf-8'),
  ];

  const htmlPluginOptions = getHTMLPluginOptions(flags, BUILD_CONFIG);

  return [
    {
      apply(compiler: Compiler) {
        compiler.hooks.compilation.tap(
          'assets-manifest-plugin',
          compilation => {
            HTMLPlugin.getHooks(compilation).beforeAssetTagGeneration.tap(
              'assets-manifest-plugin',
              arg => {
                if (
                  !BUILD_CONFIG.isElectron &&
                  !compilation.getAsset(globalErrorHandler[0])
                ) {
                  compilation.emitAsset(
                    globalErrorHandler[0],
                    new webpack.sources.RawSource(globalErrorHandler[1])
                  );
                  arg.assets.js.unshift(
                    arg.assets.publicPath + globalErrorHandler[0]
                  );
                }

                if (!compilation.getAsset('assets-manifest.json')) {
                  compilation.emitAsset(
                    globalErrorHandler[0],
                    new webpack.sources.RawSource(globalErrorHandler[1])
                  );
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
                          gitHash:
                            htmlPluginOptions.templateParameters.GIT_SHORT_SHA,
                          description:
                            htmlPluginOptions.templateParameters.DESCRIPTION,
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
}
