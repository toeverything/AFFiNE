import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { Path, ProjectRoot } from '@affine-tools/utils/path';
import { Repository } from '@napi-rs/simple-git';
import HTMLPlugin from 'html-webpack-plugin';
import { once } from 'lodash-es';
import type { Compiler, WebpackPluginInstance } from 'webpack';
import webpack from 'webpack';

export const getPublicPath = (BUILD_CONFIG: BUILD_CONFIG_TYPE) => {
  const { BUILD_TYPE } = process.env;
  if (typeof process.env.PUBLIC_PATH === 'string') {
    return process.env.PUBLIC_PATH;
  }

  if (
    BUILD_CONFIG.debug ||
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

export interface CreateHTMLPluginConfig {
  filename?: string;
  additionalEntryForSelfhost?: boolean;
  injectGlobalErrorHandler?: boolean;
  emitAssetsManifest?: boolean;
}

function getHTMLPluginOptions(BUILD_CONFIG: BUILD_CONFIG_TYPE) {
  const publicPath = getPublicPath(BUILD_CONFIG);
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
    minify: false,
    templateParameters: templateParams,
    chunks: ['app'],
    scriptLoading: 'blocking',
  } satisfies HTMLPlugin.Options;
}

const AssetsManifestPlugin = {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('assets-manifest-plugin', compilation => {
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
                    gitHash: gitShortHash(),
                    description: DESCRIPTION,
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
    });
  },
};

const GlobalErrorHandlerPlugin = {
  apply(compiler: Compiler) {
    const globalErrorHandler = [
      'js/global-error-handler.js',
      readFileSync(currentDir.join('./error-handler.js').toString(), 'utf-8'),
    ];

    compiler.hooks.compilation.tap(
      'global-error-handler-plugin',
      compilation => {
        HTMLPlugin.getHooks(compilation).beforeAssetTagGeneration.tap(
          'global-error-handler-plugin',
          arg => {
            if (!compilation.getAsset(globalErrorHandler[0])) {
              compilation.emitAsset(
                globalErrorHandler[0],
                new webpack.sources.RawSource(globalErrorHandler[1])
              );
              arg.assets.js.unshift(
                arg.assets.publicPath + globalErrorHandler[0]
              );
            }

            return arg;
          }
        );
      }
    );
  },
};

const CorsPlugin = {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('html-js-cors-plugin', compilation => {
      HTMLPlugin.getHooks(compilation).alterAssetTags.tap(
        'html-js-cors-plugin',
        options => {
          if (options.publicPath !== '/') {
            options.assetTags.scripts.forEach(script => {
              script.attributes.crossorigin = true;
            });
            options.assetTags.styles.forEach(style => {
              style.attributes.crossorigin = true;
            });
          }
          return options;
        }
      );
    });
  },
};

export function createHTMLPlugins(
  BUILD_CONFIG: BUILD_CONFIG_TYPE,
  config: CreateHTMLPluginConfig
): WebpackPluginInstance[] {
  const publicPath = getPublicPath(BUILD_CONFIG);
  const htmlPluginOptions = getHTMLPluginOptions(BUILD_CONFIG);

  const plugins: WebpackPluginInstance[] = [];
  plugins.push(
    new HTMLPlugin({
      ...htmlPluginOptions,
      chunks: ['index'],
      filename: config.filename,
      publicPath,
      meta: {
        'env:publicPath': publicPath,
      },
    })
  );

  if (BUILD_CONFIG.isElectron) {
    plugins.push(
      new HTMLPlugin({
        ...htmlPluginOptions,
        chunks: ['shell'],
        filename: 'shell.html',
        publicPath,
        meta: {
          'env:publicPath': publicPath,
        },
      }),
      new HTMLPlugin({
        ...htmlPluginOptions,
        filename: 'popup.html',
        chunks: ['popup'],
        publicPath,
        meta: {
          'env:publicPath': publicPath,
        },
      }),
      new HTMLPlugin({
        ...htmlPluginOptions,
        filename: 'background-worker.html',
        chunks: ['backgroundWorker'],
        publicPath,
        meta: {
          'env:publicPath': publicPath,
        },
      })
    );
  }

  if (!BUILD_CONFIG.isElectron) {
    plugins.push(CorsPlugin);
  }

  if (config.emitAssetsManifest) {
    plugins.push(AssetsManifestPlugin);
  }

  if (config.injectGlobalErrorHandler) {
    plugins.push(GlobalErrorHandlerPlugin);
  }

  if (config.additionalEntryForSelfhost) {
    plugins.push(
      new HTMLPlugin({
        ...htmlPluginOptions,
        chunks: ['index'],
        meta: {
          'env:isSelfHosted': 'true',
          'env:publicPath': '/',
        },
        filename: 'selfhost.html',
        templateParameters: {
          ...htmlPluginOptions.templateParameters,
          PRECONNECT: '',
        },
      })
    );
  }

  return plugins;
}
