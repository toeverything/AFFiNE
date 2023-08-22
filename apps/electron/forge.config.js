/* eslint-disable @typescript-eslint/no-var-requires */

const {
  utils: { fromBuildIdentifier },
} = require('@electron-forge/core');

const path = require('node:path');

const {
  arch,
  buildType,
  icnsPath,
  icoPath,
  platform,
  productName,
  iconUrl,
} = require('./scripts/make-env');

const makers = [
  !process.env.SKIP_BUNDLE &&
    platform === 'darwin' && {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        icon: icnsPath,
        name: 'AFFiNE',
        'icon-size': 128,
        background: path.resolve(
          __dirname,
          './resources/icons/dmg-background.png'
        ),
        contents: [
          {
            x: 176,
            y: 192,
            type: 'file',
            path: path.resolve(
              __dirname,
              'out',
              buildType,
              `${productName}-darwin-${arch}`,
              `${productName}.app`
            ),
          },
          { x: 432, y: 192, type: 'link', path: '/Applications' },
        ],
        file: path.resolve(
          __dirname,
          'out',
          buildType,
          `${productName}-darwin-${arch}`,
          `${productName}.app`
        ),
      },
    },
  {
    name: '@electron-forge/maker-zip',
    config: {
      name: 'affine',
      iconUrl: icoPath,
      setupIcon: icoPath,
      platforms: ['darwin', 'linux', 'win32'],
    },
  },
  !process.env.SKIP_BUNDLE && {
    name: '@electron-forge/maker-squirrel',
    config: {
      name: productName,
      setupIcon: icoPath,
      iconUrl: iconUrl,
      loadingGif: './resources/icons/affine_installing.gif',
    },
  },
  !process.env.SKIP_BUNDLE && {
    name: '@reforged/maker-appimage',
    config: {
      name: 'AFFiNE',
      iconUrl: icoPath,
      setupIcon: icoPath,
      platforms: ['linux'],
      options: {
        bin: productName,
      },
    },
  },
].filter(Boolean);

/**
 * @type {import('@electron-forge/shared-types').ForgeConfig}
 */
module.exports = {
  buildIdentifier: buildType,
  packagerConfig: {
    name: productName,
    appBundleId: fromBuildIdentifier({
      internal: 'pro.affine.internal',
      canary: 'pro.affine.canary',
      beta: 'pro.affine.beta',
      stable: 'pro.affine.app',
    }),
    icon: icnsPath,
    osxSign: {
      identity: 'Developer ID Application: TOEVERYTHING PTE. LTD.',
      'hardened-runtime': true,
    },
    osxNotarize: process.env.APPLE_ID
      ? {
          tool: 'notarytool',
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : undefined,
    // We need the following line for updater
    extraResource: ['./resources/app-update.yml'],
    ignore: ['e2e', 'tests'],
  },
  makers,
  hooks: {
    readPackageJson: async (_, packageJson) => {
      // we want different package name for canary build
      // so stable and canary will not share the same app data
      packageJson.productName = productName;
    },
    prePackage: async () => {
      const { rm, cp } = require('node:fs/promises');
      const { resolve } = require('node:path');

      await rm(
        resolve(__dirname, './node_modules/@toeverything/plugin-infra'),
        {
          recursive: true,
          force: true,
        }
      );

      await cp(
        resolve(__dirname, '../../packages/plugin-infra'),
        resolve(__dirname, './node_modules/@toeverything/plugin-infra'),
        {
          recursive: true,
          force: true,
        }
      );
    },
    generateAssets: async (_, platform, arch) => {
      if (process.env.SKIP_GENERATE_ASSETS) {
        return;
      }

      const { $ } = await import('zx');

      // TODO: right now we do not need the following
      // it is for octobase-node, but we dont use it for now.
      if (platform === 'darwin' && arch === 'arm64') {
        // In GitHub Actions runner, MacOS is always x64
        // we need to manually set TARGET to aarch64-apple-darwin
        process.env.TARGET = 'aarch64-apple-darwin';
      }

      if (platform === 'win32') {
        $.shell = 'powershell.exe';
        $.prefix = '';
      }

      // run yarn generate-assets
      await $`yarn generate-assets`;
    },
  },
};
