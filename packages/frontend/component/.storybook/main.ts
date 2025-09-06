import { dirname, join } from 'path';
import { StorybookConfig } from '@storybook/react-vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import swc from 'unplugin-swc';
import { mergeConfig } from 'vite';

export default {
  stories: ['../src/ui/**/*.@(mdx|stories.@(js|jsx|ts|tsx))'],

  addons: [
    '@chromatic-com/storybook',
  ],

  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },

  features: {},

  docs: {},

  async viteFinal(config, _options) {
    // Временно используем статическую конфигурацию для Storybook
    const buildConfig = {
      debug: true,
      distribution: 'web',
      isDesktopEdition: false,
      isMobileEdition: false,
      isElectron: false,
      isWeb: true,
      isMobileWeb: false,
      isIOS: false,
      isAndroid: false,
      isNative: false,
      isAdmin: false,
      appBuildType: 'canary',
      appVersion: '0.22.4',
      editorVersion: '0.22.4',
      githubUrl: 'https://github.com/toeverything/AFFiNE',
      changelogUrl: 'https://github.com/toeverything/AFFiNE/releases',
      downloadUrl: 'https://affine.pro/download',
      pricingUrl: 'https://affine.pro/pricing',
      discordUrl: 'https://affine.pro/redirect/discord',
      requestLicenseUrl: 'https://affine.pro/redirect/license',
      imageProxyUrl: '/api/worker/image-proxy',
      linkPreviewUrl: '/api/worker/link-preview',
      CAPTCHA_SITE_KEY: '',
      SENTRY_DSN: '',
      MIXPANEL_TOKEN: '',
      DEBUG_JOTAI: '',
    };

    return mergeConfig(config, {
      plugins: [
        vanillaExtractPlugin(),
        swc.vite({
          jsc: {
            preserveAllComments: true,
            parser: {
              syntax: 'typescript',
              dynamicImport: true,
              tsx: true,
              decorators: true,
            },
            target: 'es2022',
            externalHelpers: false,
            transform: {
              react: {
                runtime: 'automatic',
              },
              useDefineForClassFields: false,
              decoratorVersion: '2022-03',
            },
          },
          sourceMaps: true,
          inlineSourcesContent: true,
        }),
      ],
      define: Object.entries(buildConfig).reduce((envs, [key, value]) => {
        envs[`BUILD_CONFIG.${key}`] = JSON.stringify(value);
        return envs;
      }, {}),
    });
  },

  // typescript: {
  //   reactDocgen: 'react-docgen-typescript',
  // },
} satisfies StorybookConfig;

function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, 'package.json')));
}
