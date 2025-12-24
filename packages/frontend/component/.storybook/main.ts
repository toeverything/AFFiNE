import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
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
    const { getBuildConfig } = await import('@affine-tools/utils/build-config');
    const { Package } = await import('@affine-tools/utils/workspace');

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
      define: Object.entries(
        getBuildConfig(new Package('@affine/web'), {
          mode: 'development',
          channel: 'canary',
        })
      ).reduce((envs, [key, value]) => {
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
  return dirname(fileURLToPath(import.meta.resolve(join(value, 'package.json'))));
}

