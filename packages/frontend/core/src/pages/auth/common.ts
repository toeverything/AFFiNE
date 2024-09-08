import { z } from 'zod';

export const supportedClient = z.enum([
  'web',
  'affine',
  'affine-canary',
  'affine-beta',
  ...(environment.isDebug ? ['affine-dev'] : []),
]);
