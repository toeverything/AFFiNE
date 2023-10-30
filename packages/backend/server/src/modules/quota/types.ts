export enum QuotaType {
  Quota_FreePlanV1 = 'free_plan_v1',
  Quota_ProPlanV1 = 'pro_plan_v1',
}

export type Quota = CommonFeature & {
  type: FeatureKind.Quota;
  feature: QuotaType;
  configs: {
    blobLimit: number;
    storageQuota: number;
  };
};

export const Quotas: Quota[] = [
  {
    feature: QuotaType.Quota_FreePlanV1,
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
    feature: QuotaType.Quota_ProPlanV1,
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
