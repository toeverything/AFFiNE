// @ts-check
const withTM = require('next-transpile-modules')([
  '@toeverything/pathfinder-logger',
]);

const { getGitVersion, getCommitHash } = require('./scripts/gitInfo');

/** @type {import('next').NextConfig} */
const nextConfig = withTM({
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  swcMinify: false,
  publicRuntimeConfig: {
    NODE_ENV: process.env.NODE_ENV,
    PROJECT_NAME: process.env.npm_package_name,
    BUILD_DATE: new Date().toISOString(),
    CI: process.env.CI || null,
    VERSION: getGitVersion(),
    COMMIT_HASH: getCommitHash(),
  },
});

module.exports = nextConfig;
