const path = require('node:path');

module.exports = {
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  staticDirs: ['../../app/public'],
  addons: ['@storybook/addon-links', '@storybook/addon-essentials'],
  core: {
    builder: '@storybook/builder-webpack5',
  },
  webpackFinal: config => {
    const transpile = config.module.rules.find(x =>
      x.test.toString().includes('tsx')
    ).use;
    transpile.push({
      loader: require.resolve('swc-loader'),
      options: {
        parseMap: true,
        jsc: {
          parser: {
            syntax: 'typescript',
            dynamicImport: true,
            tsx: true,
          },
          target: 'es2022',
          transform: {
            react: {
              runtime: 'automatic',
            },
          },
        },
      },
    });

    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '..', 'src'),
      '@affine/i18n': path.resolve(__dirname, '..', '..', 'i18n', 'src'),
    };
    return config;
  },
  reactOptions: {
    fastRefresh: true,
  },
};
