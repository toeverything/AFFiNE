/* eslint-disable @typescript-eslint/no-var-requires */

const { z } = require('zod');

const path = require('node:path');

const ReleaseTypeSchema = z.enum(['stable', 'beta', 'canary', 'internal']);

const ROOT = path.resolve(__dirname, '..');

const envBuildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();
const buildType = ReleaseTypeSchema.parse(envBuildType);
const stableBuild = buildType === 'stable';
const productName = !stableBuild ? `AFFiNE-${buildType}` : 'AFFiNE';
const icoPath = path.join(
  ROOT,
  !stableBuild
    ? `./resources/icons/icon_${buildType}.ico`
    : './resources/icons/icon.ico'
);
const icnsPath = path.join(
  ROOT,
  !stableBuild
    ? `./resources/icons/icon_${buildType}.icns`
    : './resources/icons/icon.icns'
);

const iconUrl = `https://cdn.affine.pro/app-icons/icon_${buildType}.ico`;
const arch =
  process.argv.indexOf('--arch') > 0
    ? process.argv[process.argv.indexOf('--arch') + 1]
    : process.arch;

const platform =
  process.argv.indexOf('--platform') > 0
    ? process.argv[process.argv.indexOf('--platform') + 1]
    : process.platform;

module.exports = {
  ROOT,
  buildType,
  productName,
  icoPath,
  icnsPath,
  iconUrl,
  arch,
  platform,
  stableBuild,
};
