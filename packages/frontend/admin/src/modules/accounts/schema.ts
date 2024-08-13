import { FeatureType } from '@affine/graphql';
import { z } from 'zod';

const featureTypeValues = Object.values(FeatureType) as [
  FeatureType,
  ...FeatureType[],
];
const featureTypeEnum = z.enum(featureTypeValues);

export const userSchema = z.object({
  __typename: z.literal('UserType').optional(),
  id: z.string(),
  name: z.string(),
  email: z.string(),
  features: z.array(featureTypeEnum),
  hasPassword: z.boolean().nullable(),
  emailVerified: z.boolean(),
  avatarUrl: z.string().nullable(),
  quota: z
    .object({
      __typename: z.literal('UserQuota').optional(),
      humanReadable: z.object({
        __typename: z.literal('UserQuotaHumanReadable').optional(),
        blobLimit: z.string(),
        historyPeriod: z.string(),
        memberLimit: z.string(),
        name: z.string(),
        storageQuota: z.string(),
      }),
    })
    .nullable(),
});

export type User = z.infer<typeof userSchema>;
