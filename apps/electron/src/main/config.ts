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
