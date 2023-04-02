import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @type {import("next").NextConfig} */
export default {
  reactStrictMode: true,
  experimental: {
    appDir: true,
  },
  transpilePackages: ['@affine/workspace'],
  webpack: (config, { dev, isServer }) => {
    config.experiments = { ...config.experiments, topLevelAwait: true };
    config.module.rules.push({
      test: /\.md$/i,
      loader: 'raw-loader',
    });
    config.resolve.alias['yjs'] = require.resolve('yjs');

    if (!isServer && !dev && process.env.PERFSEE_TOKEN) {
      config.devtool = 'hidden-nosources-source-map';
      const perfsee = new PerfseePlugin({
        project: 'affine-toeverything',
      });
      if (Array.isArray(config.plugins)) {
        config.plugins.push(perfsee);
      } else {
        config.plugins = [perfsee];
      }
    }

    return config;
  },
};
