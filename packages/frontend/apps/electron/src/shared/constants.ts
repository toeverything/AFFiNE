import { z } from 'zod';

export const ReleaseTypeSchema = z.enum([
  'stable',
  'beta',
  'canary',
  'internal',
]);

declare global {
  // THIS variable should be replaced during the build process
  const REPLACE_ME_BUILD_ENV: string;
}

export const envBuildType = (process.env.BUILD_TYPE || REPLACE_ME_BUILD_ENV)
  .trim()
  .toLowerCase();

export const overrideSession = process.env.BUILD_TYPE === 'internal';

export const buildType = ReleaseTypeSchema.parse(envBuildType);

export const mode = process.env.NODE_ENV;
export const isDev = mode === 'development';
