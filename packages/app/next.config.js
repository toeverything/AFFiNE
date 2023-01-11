/* eslint @typescript-eslint/no-var-requires: "off" */
const { getGitVersion, getCommitHash } = require('./scripts/gitInfo');
const { dependencies } = require('./package.json');
const path = require('node:path');
const printer = require('./scripts/printer').printer;

const enableDebugLocal = path.isAbsolute(process.env.LOCAL_BLOCK_SUITE ?? '');
const EDITOR_VERSION = enableDebugLocal
  ? 'local-version'
  : dependencies['@blocksuite/editor'];

const profileTarget = {
  ac: '100.85.73.88:12001',
  dev: '100.77.180.48:11001',
  local: '127.0.0.1:3000',
};

const getRedirectConfig = profile => {
  const target = profileTarget[profile || 'dev'] || profileTarget['dev'];

  return [
    [
      { source: '/api/:path*', destination: `http://${target}/api/:path*` },
      {
        source: '/collaboration/:path*',
        destination: `http://${target}/collaboration/:path*`,
      },
    ],
    target,
  ];
};

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
    EDITOR_VERSION,
  },
  webpack: config => {
    config.experiments = { ...config.experiments, topLevelAwait: true };
    config.resolve.alias['yjs'] = require.resolve('yjs');
    config.module.rules.push({
      test: /\.md$/i,
      loader: 'raw-loader',
    });

    return config;
  },
  images: {
    unoptimized: true,
  },
  rewrites: async () => {
    const [profile, desc] = getRedirectConfig(process.env.NODE_API_SERVER);
    printer.info(
      `API request proxy to [${process.env.NODE_API_SERVER} Server]: ` + desc
    );
    return profile;
  },
  basePath: process.env.BASE_PATH,
};

const baseDir = process.env.LOCAL_BLOCK_SUITE ?? '/';
const withDebugLocal = require('next-debug-local')(
  {
    '@blocksuite/editor': path.resolve(baseDir, 'packages', 'editor'),
    '@blocksuite/blocks/models': path.resolve(
      baseDir,
      'packages',
      'blocks',
      'src',
      'models'
    ),
    '@blocksuite/blocks/std': path.resolve(
      baseDir,
      'packages',
      'blocks',
      'src',
      'std'
    ),
    '@blocksuite/blocks': path.resolve(baseDir, 'packages', 'blocks'),
    '@blocksuite/store': path.resolve(baseDir, 'packages', 'store'),
  },
  {
    enable: enableDebugLocal,
  }
);

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV !== 'production',
});

module.exports = withDebugLocal(withPWA(nextConfig));
