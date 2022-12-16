const { getGitVersion, getCommitHash } = require('./scripts/gitInfo');

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
  },
  // XXX not test yet
  rewrites: async () => {
    return [{ source: '/api/:path*', destination: '/api/:path*' }];
  },
};

module.exports = nextConfig;
