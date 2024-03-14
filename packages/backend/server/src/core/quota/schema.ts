import { FeatureKind } from '../features/types';
import { OneDay, OneGB, OneMB } from './constant';
import { Quota, QuotaType } from './types';

export const Quotas: Quota[] = [
  {
    feature: QuotaType.FreePlanV1,
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // quota name
      name: 'Free',
      // single blob limit 10MB
      blobLimit: 10 * OneMB,
      // total blob limit 10GB
      storageQuota: 10 * OneGB,
      // history period of validity 7 days
      historyPeriod: 7 * OneDay,
      // member limit 3
      memberLimit: 3,
    },
  },
  {
    feature: QuotaType.ProPlanV1,
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // quota name
      name: 'Pro',
      // single blob limit 100MB
      blobLimit: 100 * OneMB,
      // total blob limit 100GB
      storageQuota: 100 * OneGB,
      // history period of validity 30 days
      historyPeriod: 30 * OneDay,
      // member limit 10
      memberLimit: 10,
    },
  },
  {
    feature: QuotaType.RestrictedPlanV1,
    type: FeatureKind.Quota,
    version: 1,
    configs: {
      // quota name
      name: 'Restricted',
      // single blob limit 10MB
      blobLimit: OneMB,
      // total blob limit 1GB
      storageQuota: 10 * OneMB,
      // history period of validity 30 days
      historyPeriod: 30 * OneDay,
      // member limit 10
      memberLimit: 10,
    },
  },
  {
    feature: QuotaType.FreePlanV1,
    type: FeatureKind.Quota,
    version: 2,
    configs: {
      // quota name
      name: 'Free',
      // single blob limit 10MB
      blobLimit: 100 * OneMB,
      // total blob limit 10GB
      storageQuota: 10 * OneGB,
      // history period of validity 7 days
      historyPeriod: 7 * OneDay,
      // member limit 3
      memberLimit: 3,
    },
  },
  {
    feature: QuotaType.FreePlanV1,
    type: FeatureKind.Quota,
    version: 3,
    configs: {
      // quota name
      name: 'Free',
      // single blob limit 10MB
      blobLimit: 10 * OneMB,
      // server limit will larger then client to handle a edge case:
      // when a user downgrades from pro to free, he can still continue
      // to upload previously added files that exceed the free limit
      // NOTE: this is a product decision, may change in future
      businessBlobLimit: 100 * OneMB,
      // total blob limit 10GB
      storageQuota: 10 * OneGB,
      // history period of validity 7 days
      historyPeriod: 7 * OneDay,
      // member limit 3
      memberLimit: 3,
    },
  },
];

export const Quota_FreePlanV1_1 = {
  feature: Quotas[4].feature,
  version: Quotas[4].version,
};

export const Quota_ProPlanV1 = {
  feature: Quotas[1].feature,
  version: Quotas[1].version,
};
