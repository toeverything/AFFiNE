const isCanary = process.env.BUILD_TYPE === 'canary';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { notarize } = require('@electron/notarize');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execSync } = require('child_process');
const productName = isCanary ? 'AFFiNE-Canary' : 'AFFiNE';
const icoPath = isCanary
  ? './resources/icons/icon_canary.ico'
  : './resources/icons/icon.ico';
const icnsPath = isCanary
  ? './resources/icons/icon_canary.icns'
  : './resources/icons/icon.icns';

const osName = process.platform === 'darwin' ? 'macos' : process.platform;

module.exports = {
  protocols: [
    {
      name: productName,
      schemes: ['affine'],
    },
  ],
  extraMetadata: {
    name: productName,
  },
  artifactName:
    'affine' + (isCanary ? '-canary' : '') + `-${osName}` + '-${arch}.${ext}',
  generateUpdatesFilesForAllChannels: true,
  compression: 'normal',
  appId: isCanary ? 'pro.affine.canary' : 'pro.affine.app',
  productName: productName,
  mac: {
    target: 'dmg',
    icon: icnsPath,
    identity: 'TOEVERYTHING PTE. LTD.',
    hardenedRuntime: true,
    publish: {
      provider: 'github',
      channel: isCanary ? 'canary' : 'latest',
    },
  },
  afterSign: async context => {
    if (context.electronPlatformName === 'darwin' && process.env.APPLE_ID) {
      notarize({
        appBundleId: isCanary ? 'pro.affine.canary' : 'pro.affine.app',
        appPath: `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      });
    }
  },
  linux: {
    desktop: {
      StartupNotify: 'false',
      Encoding: 'UTF-8',
      MimeType: 'x-scheme-handler/affine',
    },
    target: ['AppImage', 'rpm', 'deb'],
  },
  directories: {
    buildResources: 'resources',
    output: 'dist',
  },
  files: ['dist/layers/**/*'],
  beforePack: async context => {
    await execSync('yarn generate-assets');
    context.packager.appInfo.info._metadata.name = productName;
  },
};
