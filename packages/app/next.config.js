/* eslint @typescript-eslint/no-var-requires: "off" */
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
  webpack: config => {
    config.resolve.alias['yjs'] = require.resolve('yjs');
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
  basePath: process.env.BASE_PATH,
};

const baseDir = process.env.LOCAL_BLOCK_SUITE ?? '/';
const withDebugLocal = require('next-debug-local')(
  {
    '@blocksuite/editor': path.resolve(baseDir, 'packages', 'editor'),
    '@blocksuite/blocks': path.resolve(baseDir, 'packages', 'blocks'),
    '@blocksuite/store': path.resolve(baseDir, 'packages', 'store'),
  },
  {
    enable: path.isAbsolute(process.env.LOCAL_BLOCK_SUITE ?? ''),
  }
);

module.exports = withDebugLocal(nextConfig);
