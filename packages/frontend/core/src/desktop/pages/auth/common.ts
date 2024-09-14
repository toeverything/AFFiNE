import { z } from 'zod';

export const supportedClient = z.enum([
  'web',
  'affine',
  'affine-canary',
  'affine-beta',
  ...(BUILD_CONFIG.debug ? ['affine-dev'] : []),
]);
