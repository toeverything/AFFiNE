const { getGitVersion, getCommitHash } = require('./scripts/gitInfo');
const { dependencies } = require('./package.json');
const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  reactStrictMode: false,
  swcMinify: false,
  publicRuntimeConfig: {
    NODE_ENV: process.env.NODE_ENV,
    PROJECT_NAME: process.env.npm_package_name,
    BUILD_DATE: new Date().toISOString(),
    CI: process.env.CI || null,
    VERSION: getGitVersion(),
    COMMIT_HASH: getCommitHash(),
    EDITOR_VERSION: dependencies['@blocksuite/editor'],
  },
  transpilePackages: process.env.LOCAL_BLOCK_SUITE
    ? ['@blocksuite/editor', '@blocksuite/blocks', '@blocksuite/store']
    : [],
  webpack: config => {
    if (process.env.LOCAL_BLOCK_SUITE) {
      config.resolve.alias['yjs'] = require.resolve('yjs');
      config.resolve.extensionAlias = {
        '.js': ['.js', '.ts', '.tsx'],
      };
      const baseDir = process.env.LOCAL_BLOCK_SUITE;
      config.resolve.alias['@blocksuite/editor'] = path.resolve(
        baseDir,
        'packages',
        'editor'
      );
      config.resolve.alias['@blocksuite/blocks'] = path.resolve(
        baseDir,
        'packages',
        'blocks'
      );
      config.resolve.alias['@blocksuite/store'] = path.resolve(
        baseDir,
        'packages',
        'store'
      );
    }
    return config;
  },
  images: {
    unoptimized: true,
  },
  // XXX not test yet
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: 'http://100.77.180.48:11001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
