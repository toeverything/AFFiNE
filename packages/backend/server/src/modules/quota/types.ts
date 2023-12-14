import { CommonFeature, FeatureKind } from '../features';

export enum QuotaType {
  Quota_FreePlanV1 = 'free_plan_v1',
  Quota_ProPlanV1 = 'pro_plan_v1',
}

export enum QuotaName {
  free_plan_v1 = 'Free Plan',
  pro_plan_v1 = 'Pro Plan',
}

export type Quota = CommonFeature & {
  type: FeatureKind.Quota;
  feature: QuotaType;
  configs: {
    blobLimit: number;
    storageQuota: number;
    historyPeriod: number;
    memberLimit: number;
  };
};

const OneKB = 1024;
const OneMB = OneKB * OneKB;
const OneGB = OneKB * OneMB;

const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

export function formatSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';

  const dm = decimals < 0 ? 0 : decimals;

  const i = Math.floor(Math.log(bytes) / Math.log(OneKB));

  return parseFloat((bytes / Math.pow(OneKB, i)).toFixed(dm)) + ' ' + sizes[i];
}

const OneDay = 1000 * 60 * 60 * 24;

export function formatDate(ms: number): string {
  return `${(ms / OneDay).toFixed(0)} days`;
}

export function getQuotaName(quota: QuotaType): string {
  return QuotaName[quota];
}

export const Quotas: Quota[] = [
  {
    feature: QuotaType.Quota_FreePlanV1,
    type: FeatureKind.Quota,
    version: 1,
    configs: {
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
    feature: QuotaType.Quota_ProPlanV1,
    type: FeatureKind.Quota,
    version: 1,
    configs: {
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
];

// ======== payload ========

export const Quota_FreePlanV1 = {
  feature: Quotas[0].feature,
  version: Quotas[0].version,
};

export const Quota_ProPlanV1 = {
  feature: Quotas[1].feature,
  version: Quotas[1].version,
};
