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
  stable: `https://affine.fail`,
  beta: `https://affine.fail`,
  canary: `https://affine.fail`,
  internal: `https://affine.fail`,
}

export const CLOUD_API_URL = API_URL_MAPPING[buildType];
