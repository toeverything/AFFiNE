import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const ReleaseTypeSchema = z.enum(['stable', 'beta', 'canary', 'internal']);

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
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

const iconX64PngPath = path.join(
  ROOT,
  `./resources/icons/icon_${buildType}_64x64.png`
);

const icnsPath = path.join(
  ROOT,
  !stableBuild
    ? `./resources/icons/icon_${buildType}.icns`
    : './resources/icons/icon.icns'
);

const iconPngPath = path.join(ROOT, './resources/icons/icon.png');

const iconUrl = `https://cdn.affine.pro/app-icons/icon_${buildType}.ico`;
const arch =
  process.argv.indexOf('--arch') > 0
    ? process.argv[process.argv.indexOf('--arch') + 1]
    : process.arch;

const platform =
  process.argv.indexOf('--platform') > 0
    ? process.argv[process.argv.indexOf('--platform') + 1]
    : process.platform;

const appIdMap = {
  internal: 'pro.affine.internal',
  canary: 'pro.affine.canary',
  beta: 'pro.affine.beta',
  stable: 'pro.affine.app',
};

export {
  appIdMap,
  arch,
  buildType,
  icnsPath,
  iconPngPath,
  iconUrl,
  iconX64PngPath,
  icoPath,
  platform,
  productName,
  REPO_ROOT,
  ROOT,
  stableBuild,
};
