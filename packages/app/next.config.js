const withTM = require('next-transpile-modules')(['@toeverything/pathfinder-logger']);

/** @type {import('next').NextConfig} */
const nextConfig = withTM({
  productionBrowserSourceMaps: true,
  reactStrictMode: false,
  swcMinify: false,
});

module.exports = nextConfig;
