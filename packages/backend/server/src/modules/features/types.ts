import { URL } from 'node:url';

import { z } from 'zod';

/// ======== common schema ========

export enum FeatureKind {
  Feature,
  Quota,
}

export const commonFeatureSchema = z.object({
  feature: z.string(),
  type: z.nativeEnum(FeatureKind),
  version: z.number(),
  configs: z.unknown(),
});

export type CommonFeature = z.infer<typeof commonFeatureSchema>;

/// ======== feature define ========

export enum FeatureType {
  EarlyAccess = 'early_access',
}

function checkHostname(host: string) {
  try {
    return new URL(`https://${host}`).hostname === host;
  } catch (_) {
    return false;
  }
}

const featureEarlyAccess = z.object({
  feature: z.literal(FeatureType.EarlyAccess),
  configs: z.object({
    whitelist: z
      .string()
      .startsWith('@')
      .refine(domain => checkHostname(domain.slice(1)))
      .array(),
  }),
});

export const Features: Feature[] = [
  {
    feature: FeatureType.EarlyAccess,
    type: FeatureKind.Feature,
    version: 1,
    configs: {
      whitelist: ['@toeverything.info'],
    },
  },
];

/// ======== schema infer ========

export const FeatureSchema = commonFeatureSchema
  .extend({
    type: z.literal(FeatureKind.Feature),
  })
  .and(z.discriminatedUnion('feature', [featureEarlyAccess]));

export type Feature = z.infer<typeof FeatureSchema>;
