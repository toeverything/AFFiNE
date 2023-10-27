import type { Prisma } from '@prisma/client';

export enum FeatureKind {
  Feature,
  Quota,
}

export type CommonFeature = {
  feature: FeatureType;
  type: FeatureKind;
  version: number;
  configs: Prisma.InputJsonValue;
};

export type Feature = CommonFeature & {
  type: FeatureKind.Feature;
};

export type Quota = CommonFeature & {
  type: FeatureKind.Quota;
  configs: {
    blobLimit: number;
    storageQuota: number;
  };
};

export enum FeatureType {
  // features
  Feature_EarlyAccess = 'early_access',
  // quotas
  Quota_FreePlanV1 = 'free_plan_v1',
  Quota_ProPlanV1 = 'pro_plan_v1',
}

export const Quotas: Quota[] = [
  {
    feature: FeatureType.Quota_FreePlanV1,
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // single blob limit 10MB
      blobLimit: 10 * 1024 * 1024,
      // total blob limit 10GB
      storageQuota: 10 * 1024 * 1024 * 1024,
    },
  },
  {
    feature: FeatureType.Quota_ProPlanV1,
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // single blob limit 100MB
      blobLimit: 100 * 1024 * 1024,
      // total blob limit 100GB
      storageQuota: 100 * 1024 * 1024 * 1024,
    },
  },
];
