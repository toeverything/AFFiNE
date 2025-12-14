import cp from 'node:child_process';
import { rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { utils } from '@electron-forge/core';
import { FusesPlugin } from '@electron-forge/plugin-fuses';

import {
  appIdMap,
  arch,
  buildType,
  icnsPath,
  iconPngPath,
  iconUrl,
  iconX512PngPath,
  icoPath,
  platform,
  productName,
} from './scripts/make-env.js';

const fromBuildIdentifier = utils.fromBuildIdentifier;

const linuxMimeTypes = [`x-scheme-handler/${productName.toLowerCase()}`];

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const makers = [
  !process.env.SKIP_BUNDLE &&
    platform === 'darwin' && {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULMO',
        icon: icnsPath,
        name: 'AFFiNE',
        'icon-size': 128,
        background: path.join(
          __dirname,
          './resources/icons/dmg-background.png'
        ),
        contents: [
          {
            x: 176,
            y: 192,
            type: 'file',
            path: path.join(
              __dirname,
              'out',
              buildType,
              `${productName}-darwin-${arch}`,
              `${productName}.app`
            ),
          },
          { x: 432, y: 192, type: 'link', path: '/Applications' },
        ],
        iconSize: 118,
        file: path.join(
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
    name: '@pengx17/electron-forge-maker-appimage',
    platforms: ['linux'],
    config: {
      icons: [
        {
          file: iconX512PngPath,
          size: 512,
        },
      ],
    },
  },
  !process.env.SKIP_BUNDLE && {
    name: '@electron-forge/maker-deb',
    config: {
      bin: productName,
      options: {
        name: productName,
        productName,
        icon: iconX512PngPath,
        mimeType: linuxMimeTypes,
        scripts: {
          // maker-deb does not have a way to include arbitrary files in package root
          // instead, put files in extraResource, and then install with a script
          postinst: './resources/deb/postinst',
          prerm: './resources/deb/prerm',
        },
      },
    },
  },
  !process.env.SKIP_BUNDLE &&
    false && {
      name: '@electron-forge/maker-flatpak',
      platforms: ['linux'],
      /** @type {import('@electron-forge/maker-flatpak').MakerFlatpakConfig} */
      config: {
        options: {
          mimeType: linuxMimeTypes,
          productName,
          bin: productName,
          id: fromBuildIdentifier(appIdMap),
          icon: iconPngPath, // not working yet
          branch: buildType,
          files: [
            [
              './resources/affine.metainfo.xml',
              '/usr/share/metainfo/affine.metainfo.xml',
            ],
          ],
          runtimeVersion: '25.08',
          modules: [
            {
              name: 'zypak',
              sources: [
                {
                  type: 'git',
                  url: 'https://github.com/refi64/zypak',
                  tag: 'v2025.09',
                },
              ],
            },
          ],
          finishArgs: [
            // Wayland/X11 Rendering
            '--socket=wayland',
            '--socket=x11',
            '--share=ipc',
            // Open GL
            '--device=dri',
            // Audio output
            '--socket=pulseaudio',
            // Read/write home directory access
            '--filesystem=home',
            // Allow communication with network
            '--share=network',
            // System notifications with libnotify
            '--talk-name=org.freedesktop.Notifications',
          ],
        },
      },
    },
].filter(Boolean);

/**
 * @type {import('@electron-forge/shared-types').ForgeConfig}
 */
export default {
  buildIdentifier: buildType,
  packagerConfig: {
    name: productName,
    appBundleId: fromBuildIdentifier(appIdMap),
    icon: icnsPath,
    osxSign: {
      identity: 'Developer ID Application: TOEVERYTHING PTE. LTD.',
      'hardened-runtime': true,
    },
    electronZipDir: process.env.ELECTRON_FORGE_ELECTRON_ZIP_DIR,
    osxNotarize: process.env.APPLE_ID
      ? {
          tool: 'notarytool',
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : undefined,
    // We need the following line for updater
    extraResource: [
      './resources/app-update.yml',
      ...(platform === 'linux' ? ['./resources/affine.metainfo.xml'] : []),
    ],
    protocols: [
      {
        name: productName,
        schemes: [productName.toLowerCase()],
      },
    ],
    executableName: productName,
    asar: true,
    extendInfo: {
      NSAudioCaptureUsageDescription:
        'Please allow access in order to capture audio from other apps by AFFiNE.',
    },
  },
  makers,
  plugins: [
    { name: '@electron-forge/plugin-auto-unpack-natives', config: {} },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    readPackageJson: async (_, packageJson) => {
      // we want different package name for canary build
      // so stable and canary will not share the same app data
      packageJson.productName = productName;
    },
    prePackage: async () => {
      if (!process.env.HOIST_NODE_MODULES) {
        await rm(path.join(__dirname, 'node_modules'), {
          recursive: true,
          force: true,
        });

        await symlink(
          path.join(__dirname, '..', '..', '..', 'node_modules'),
          path.join(__dirname, 'node_modules')
        );
      }
    },
    generateAssets: async (_, platform, arch) => {
      if (process.env.SKIP_GENERATE_ASSETS) {
        return;
      }

      // TODO(@Peng): right now we do not need the following
      // it is for octobase-node, but we dont use it for now.
      if (platform === 'darwin' && arch === 'arm64') {
        // In GitHub Actions runner, MacOS is always x64
        // we need to manually set TARGET to aarch64-apple-darwin
        process.env.TARGET = 'aarch64-apple-darwin';
      }

      cp.spawnSync('yarn', ['generate-assets'], {
        stdio: 'inherit',
        cwd: __dirname,
      });
    },
  },
};
