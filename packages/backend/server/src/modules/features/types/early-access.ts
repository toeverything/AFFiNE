import { URL } from 'node:url';

import { z } from 'zod';

import { FeatureType } from './common';

function checkHostname(host: string) {
  try {
    return new URL(`https://${host}`).hostname === host;
  } catch (_) {
    return false;
  }
}

export const featureEarlyAccess = z.object({
  feature: z.literal(FeatureType.EarlyAccess),
  configs: z.object({
    whitelist: z
      .string()
      .startsWith('@')
      .refine(domain => checkHostname(domain.slice(1)))
      .array(),
  }),
});
