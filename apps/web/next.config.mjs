// @ts-check
import { createRequire } from 'node:module';
import path from 'node:path';

import { runCli } from '@magic-works/i18n-codegen';
import { PerfseePlugin } from '@perfsee/webpack';
import { withSentryConfig } from '@sentry/nextjs';
import SentryWebpackPlugin from '@sentry/webpack-plugin';
import debugLocal from 'next-debug-local';
import { fileURLToPath } from 'url';

import { blockSuiteFeatureFlags, buildFlags } from './preset.config.mjs';
import { getCommitHash, getGitVersion } from './scripts/git-info.mjs';

const require = createRequire(import.meta.url);
const { createVanillaExtractPlugin } = require('@vanilla-extract/next-plugin');
const withVanillaExtract = createVanillaExtractPlugin();

console.info('Build Flags', buildFlags);
console.info('Editor Flags', blockSuiteFeatureFlags);

if (process.env.NODE_ENV !== 'development') {
  await runCli(
    {
      config: fileURLToPath(
        new URL('../../.i18n-codegen.json', import.meta.url)
      ),
      watch: false,
    },
    error => {
      console.error(error);
      process.exit(1);
    }
  );
}

const enableDebugLocal = path.isAbsolute(process.env.LOCAL_BLOCK_SUITE ?? '');

if (enableDebugLocal) {
  console.info('Debugging local blocksuite');
}

if (process.env.COVERAGE === 'true') {
  console.info('Enable coverage report');
}

const profileTarget = {
  ac: '100.85.73.88:12001',
  dev: '100.84.105.99:11001',
  test: '100.84.105.99:11001',
  stage: '',
  prod: 'https://app.affine.pro',
  local: '127.0.0.1:3000',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  typescript: {
    // We use `yarn typecheck` on top level to check types
    ignoreBuildErrors: true,
  },
  sentry: {
    hideSourceMaps: true,
  },
  productionBrowserSourceMaps: true,
  compiler: {
    styledComponents: true,
    removeConsole: {
      exclude: ['error', 'log', 'warn', 'info'],
    },
    reactRemoveProperties: !buildFlags.enableTestProperties
      ? {
          properties: ['^data-testid$'],
        }
      : false,
    emotion: {
      sourceMap: true,
    },
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    swcPlugins: [
      process.env.COVERAGE === 'true' && ['swc-plugin-coverage-instrument', {}],
      // ['@swc-jotai/debug-label', {}],
      // ['@swc-jotai/react-refresh', {}],
    ].filter(Boolean),
  },
  reactStrictMode: true,
  transpilePackages: [
    'jotai-devtools',
    '@affine/component',
    '@affine/i18n',
    '@affine/debug',
    '@affine/env',
    '@affine/templates',
    '@affine/workspace',
    '@affine/jotai',
    '@affine/copilot',
    '@toeverything/hooks',
    '@toeverything/y-indexeddb',
    '@toeverything/infra',
    '@toeverything/plugin-infra',
  ],
  publicRuntimeConfig: {
    PROJECT_NAME: process.env.npm_package_name ?? 'AFFiNE',
    BUILD_DATE: new Date().toISOString(),
    gitVersion: getGitVersion(),
    hash: getCommitHash(),
    serverAPI:
      profileTarget[process.env.API_SERVER_PROFILE || 'dev'] ??
      profileTarget.dev,
    editorFlags: blockSuiteFeatureFlags,
    ...buildFlags,
  },
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
    if (
      process.env.SENTRY_AUTH_TOKEN &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT
    ) {
      config.plugins.push(
        new SentryWebpackPlugin({
          include: '.next',
          ignore: ['node_modules', 'cypress', 'test'],
          urlPrefix: '~/_next',
        })
      );
    }

    return config;
  },
  basePath: process.env.NEXT_BASE_PATH,
  assetPrefix: process.env.NEXT_ASSET_PREFIX,
  pageExtensions: [
    ...(buildFlags.enableDebugPage ? ['tsx', 'dev.tsx'] : ['tsx']),
  ],
};

const baseDir = process.env.LOCAL_BLOCK_SUITE ?? '/';
const withDebugLocal = debugLocal(
  {
    '@blocksuite/editor': path.resolve(baseDir, 'packages', 'editor'),
    '@blocksuite/block-std': path.resolve(baseDir, 'packages', 'block-std'),
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
    '@blocksuite/blocks/content-parser': path.resolve(
      baseDir,
      'packages',
      'blocks',
      'src',
      'content-parser'
    ),
    '@blocksuite/blocks': path.resolve(baseDir, 'packages', 'blocks'),
    '@blocksuite/store': path.resolve(baseDir, 'packages', 'store'),
    '@blocksuite/store/providers/broadcast-channel': path.resolve(
      baseDir,
      'packages',
      'store',
      'src',
      'providers',
      'broadcast-channel'
    ),
  },
  {
    enable: enableDebugLocal,
  }
);

const detectFirebaseConfig = () => {
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    console.warn(
      'NEXT_PUBLIC_FIREBASE_API_KEY not found, affine cloud feature will be disabled.'
    );
  } else {
    console.info('NEXT_PUBLIC_FIREBASE_API_KEY found.');
  }
};
detectFirebaseConfig();

let config = withDebugLocal(nextConfig);

if (process.env.SENTRY_AUTH_TOKEN) {
  config = withSentryConfig(config, {
    silent: true,
  });
} else {
  console.log(
    'SENTRY_AUTH_TOKEN not found, Sentry monitoring feature will be disabled.'
  );
  delete config.sentry;
}

if (process.env.PERFSEE_TOKEN) {
  console.info('perfsee token found.');
} else {
  console.warn(
    'perfsee token not found. performance monitoring will be disabled.'
  );
}

export default withVanillaExtract(config);
