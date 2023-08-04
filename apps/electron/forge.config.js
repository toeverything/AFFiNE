/* eslint-disable @typescript-eslint/no-var-requires */

const { z } = require('zod');

const {
  utils: { fromBuildIdentifier },
} = require('@electron-forge/core');

const path = require('node:path');

const ReleaseTypeSchema = z.enum(['stable', 'beta', 'canary', 'internal']);

const envBuildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();
const buildType = ReleaseTypeSchema.parse(envBuildType);
const stableBuild = buildType === 'stable';
const productName = !stableBuild ? `AFFiNE-${buildType}` : 'AFFiNE';
const icoPath = !stableBuild
  ? `./resources/icons/icon_${buildType}.ico`
  : './resources/icons/icon.ico';
const icnsPath = !stableBuild
  ? `./resources/icons/icon_${buildType}.icns`
  : './resources/icons/icon.icns';

const arch =
  process.argv.indexOf('--arch') > 0
    ? process.argv[process.argv.indexOf('--arch') + 1]
    : process.arch;

const windowsIconUrl = `https://cdn.affine.pro/app-icons/icon_${buildType}.ico`;

const makers = [
  !process.env.SKIP_BUNDLE && {
    name: '@affine/maker-dmg',
    config: {
      format: 'ULFO',
      icon: icnsPath,
      name: 'AFFiNE',
      'icon-size': 128,
      background: path.resolve(
        __dirname,
        './resources/icons/dmg-background.png'
      ),
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
      name: 'AFFiNE',
      setupIcon: icoPath,
      iconUrl: windowsIconUrl,
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

      await rm(resolve(__dirname, './node_modules/@toeverything/infra'), {
        recursive: true,
        force: true,
      });

      await cp(
        resolve(__dirname, '../../packages/infra'),
        resolve(__dirname, './node_modules/@toeverything/infra'),
        {
          recursive: true,
          force: true,
        }
      );

      await rm(resolve(__dirname, './node_modules/@affine/sdk'), {
        recursive: true,
        force: true,
      });

      await cp(
        resolve(__dirname, '../../packages/sdk'),
        resolve(__dirname, './node_modules/@affine/sdk'),
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
