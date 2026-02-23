import cp from 'node:child_process';
import { readdir, rm, symlink } from 'node:fs/promises';
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
  iconUrl,
  iconX64PngPath,
  iconX512PngPath,
  icoPath,
  platform,
  productName,
} from './scripts/make-env.js';

const fromBuildIdentifier = utils.fromBuildIdentifier;

const linuxMimeTypes = [`x-scheme-handler/${productName.toLowerCase()}`];

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const DEFAULT_ELECTRON_LOCALES_KEEP = new Set([
  'en',
  'en_US',
  'en_GB',
  'zh_CN',
  'zh_TW',
  'fr',
  'es',
  'es_419',
  'pl',
  'de',
  'ru',
  'ja',
  'it',
  'ca',
  'da',
  'hi',
  'sv',
  'ur',
  'ar',
  'uk',
  'ko',
  'pt_BR',
  'fa',
  'nb',
]);

const getElectronLocalesKeep = () => {
  const raw = process.env.ELECTRON_LOCALES_KEEP?.trim();
  if (!raw) return DEFAULT_ELECTRON_LOCALES_KEEP;

  const normalized = raw.toLowerCase();
  if (normalized === 'all' || normalized === '*') return null;

  const keep = new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );

  // Always keep English as a safe fallback.
  keep.add('en');
  keep.add('en_US');
  keep.add('en_GB');
  return keep;
};

const getElectronPakLocalesKeep = keep => {
  const pakKeep = new Set();
  for (const locale of keep) {
    if (locale === 'en') {
      pakKeep.add('en-US');
      continue;
    }
    pakKeep.add(locale.replaceAll('_', '-'));
  }

  // Always keep English (US) as a safe fallback for Chromium/Electron locales.
  pakKeep.add('en');
  pakKeep.add('en-US');
  pakKeep.add('en-GB');
  return pakKeep;
};

const trimElectronFrameworkLocales = async (
  resourcesAppDir,
  targetPlatform
) => {
  if (process.env.TRIM_ELECTRON_LOCALES === '0') return;
  if (targetPlatform !== 'darwin' && targetPlatform !== 'mas') return;

  const keep = getElectronLocalesKeep();
  if (!keep) return;

  const contentsDir = path.resolve(resourcesAppDir, '..', '..');
  const frameworkResourcesDir = path.join(
    contentsDir,
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources'
  );

  let entries;
  try {
    entries = await readdir(frameworkResourcesDir, { withFileTypes: true });
  } catch {
    return;
  }
  const localeDirs = entries
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.lproj'))
    .map(entry => entry.name);

  await Promise.all(
    localeDirs.map(async dirName => {
      const locale = dirName.slice(0, -'.lproj'.length);
      if (keep.has(locale)) return;
      await rm(path.join(frameworkResourcesDir, dirName), {
        recursive: true,
        force: true,
      });
    })
  );
};

const trimElectronPakLocales = async (resourcesAppDir, targetPlatform) => {
  if (process.env.TRIM_ELECTRON_LOCALES === '0') return;
  if (targetPlatform !== 'win32' && targetPlatform !== 'linux') return;

  const keep = getElectronLocalesKeep();
  if (!keep) return;

  const rootDir = path.resolve(resourcesAppDir, '..', '..');
  const localesDir = path.join(rootDir, 'locales');

  let entries;
  try {
    entries = await readdir(localesDir, { withFileTypes: true });
  } catch {
    return;
  }

  const pakKeep = getElectronPakLocalesKeep(keep);

  await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.pak'))
      .map(async entry => {
        const locale = entry.name.slice(0, -'.pak'.length);
        if (pakKeep.has(locale)) return;
        await rm(path.join(localesDir, entry.name), { force: true });
      })
  );
};

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
  !process.env.SKIP_BUNDLE && {
    name: '@electron-forge/maker-flatpak',
    platforms: ['linux'],
    /** @type {import('@electron-forge/maker-flatpak').MakerFlatpakConfig} */
    config: {
      options: {
        mimeType: linuxMimeTypes,
        productName,
        bin: productName,
        id: fromBuildIdentifier(appIdMap),
        icon: {
          '64x64': iconX64PngPath,
          '512x512': iconX512PngPath,
        },
        branch: buildType,
        runtime: 'org.freedesktop.Platform',
        runtimeVersion: '25.08',
        sdk: 'org.freedesktop.Sdk',
        base: 'org.electronjs.Electron2.BaseApp',
        baseVersion: '25.08',
        files: [
          [
            './resources/affine.metainfo.xml',
            '/usr/share/metainfo/affine.metainfo.xml',
          ],
        ],
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
    ignore: [
      /\.map$/,
      /\/test($|\/)/,
      /\/scripts($|\/)/,
      /\/examples($|\/)/,
      /\/docs($|\/)/,
      /\/README\.md$/,
      /\/forge\.config\.mjs$/,
      /\/dev-app-update\.yml$/,
      /\/resources\/app-update\.yml$/,
    ],
    afterCopy: [
      (buildPath, _electronVersion, targetPlatform, _arch, done) => {
        Promise.all([
          trimElectronFrameworkLocales(buildPath, targetPlatform),
          trimElectronPakLocales(buildPath, targetPlatform),
        ])
          .then(() => done())
          .catch(done);
      },
    ],
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
