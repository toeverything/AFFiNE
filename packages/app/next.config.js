const { getGitVersion, getCommitHash } = require('./scripts/gitInfo');
const { dependencies } = require('./package.json')

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
    EDITOR_VERSION: dependencies['@blocksuite/editor']
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
