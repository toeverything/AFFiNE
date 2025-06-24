import { z } from 'zod';

type Schema =
  | 'affine'
  | 'affine-canary'
  | 'affine-beta'
  | 'affine-internal'
  | 'affine-dev';

// todo: remove duplicated codes
const ReleaseTypeSchema = z.enum(['stable', 'beta', 'canary', 'internal']);
const envBuildType = (process.env.BUILD_TYPE || 'canary').trim().toLowerCase();
const buildType = ReleaseTypeSchema.parse(envBuildType);
const isDev = process.env.NODE_ENV === 'development';
let scheme =
  buildType === 'stable' ? 'affine' : (`affine-${envBuildType}` as Schema);
scheme = isDev ? 'affine-dev' : scheme;

export const appInfo = {
  electron: true,
  windowName:
    process.argv.find(arg => arg.startsWith('--window-name='))?.split('=')[1] ??
    'unknown',
  viewId:
    process.argv.find(arg => arg.startsWith('--view-id='))?.split('=')[1] ??
    'unknown',
  scheme,
};

export type AppInfo = typeof appInfo;
