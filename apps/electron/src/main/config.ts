import { z } from 'zod';

export const ReleaseTypeSchema = z.enum([
  'stable',
  'beta',
  'canary',
  'internal',
]);

export const envBuildType = (process.env.BUILD_TYPE || 'canary')
  .trim()
  .toLowerCase();
export const buildType = ReleaseTypeSchema.parse(envBuildType);

export const mode = process.env.NODE_ENV;
export const isDev = mode === 'development';

const API_URL_MAPPING = {
  stable: `https://app.affine.pro`,
  beta: `https://insider.affine.pro`,
  canary: `https://affine.fail`,
  internal: `https://affine.fail`,
};

export const CLOUD_BASE_URL =
  process.env.DEV_SERVER_URL || API_URL_MAPPING[buildType];
