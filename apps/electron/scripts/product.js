/* eslint-disable @typescript-eslint/no-var-requires */
const { z } = require('zod');
const ReleaseTypeSchema = z.enum(['stable', 'beta', 'canary', 'internal']);
const envBuildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();
const buildType = ReleaseTypeSchema.parse(envBuildType);
const stableBuild = buildType === 'stable';
const productName = !stableBuild ? `AFFiNE-${buildType}` : 'AFFiNE';

module.exports = {
  productName,
  buildType,
};
