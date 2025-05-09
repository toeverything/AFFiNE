import { z } from 'zod';

import { OneDay, OneGB, OneMB } from '../../base';

const UserPlanQuotaConfig = z.object({
  // quota name
  name: z.string(),
  // single blob limit
  blobLimit: z.number(),
  // server limit will larger then client to handle a edge case:
  // when a user downgrades from pro to free, he can still continue
  // to upload previously added files that exceed the free limit
  // NOTE: this is a product decision, may change in future
  businessBlobLimit: z.number().optional(),
  // total blob limit
  storageQuota: z.number(),
  // history period of validity
  historyPeriod: z.number(),
  // member limit
  memberLimit: z.number(),
  // copilot action limit
  copilotActionLimit: z.number().optional(),
});

export type UserQuota = z.infer<typeof UserPlanQuotaConfig>;

const WorkspaceQuotaConfig = UserPlanQuotaConfig.extend({
  // seat quota
  seatQuota: z.number(),
}).omit({
  copilotActionLimit: true,
});

export type WorkspaceQuota = z.infer<typeof WorkspaceQuotaConfig>;

const EMPTY_CONFIG = z.object({});

export enum FeatureType {
  Feature,
  Quota,
}

export enum Feature {
  // user
  Admin = 'administrator',
  EarlyAccess = 'early_access',
  AIEarlyAccess = 'ai_early_access',
  UnlimitedCopilot = 'unlimited_copilot',
  FreePlan = 'free_plan_v1',
  ProPlan = 'pro_plan_v1',
  LifetimeProPlan = 'lifetime_pro_plan_v1',

  // workspace
  UnlimitedWorkspace = 'unlimited_workspace',
  TeamPlan = 'team_plan_v1',
}

// TODO(@forehalo): may merge `FeatureShapes` and `FeatureConfigs`?
export const FeaturesShapes = {
  early_access: z.object({ whitelist: z.array(z.string()) }),
  unlimited_workspace: EMPTY_CONFIG,
  unlimited_copilot: EMPTY_CONFIG,
  ai_early_access: EMPTY_CONFIG,
  administrator: EMPTY_CONFIG,
  free_plan_v1: UserPlanQuotaConfig,
  pro_plan_v1: UserPlanQuotaConfig,
  lifetime_pro_plan_v1: UserPlanQuotaConfig,
  team_plan_v1: WorkspaceQuotaConfig,
} satisfies Record<Feature, z.ZodObject<any>>;

export type UserFeatureName = keyof Pick<
  typeof FeaturesShapes,
  | 'early_access'
  | 'ai_early_access'
  | 'unlimited_copilot'
  | 'administrator'
  | 'free_plan_v1'
  | 'pro_plan_v1'
  | 'lifetime_pro_plan_v1'
>;
export type WorkspaceFeatureName = keyof Pick<
  typeof FeaturesShapes,
  'unlimited_workspace' | 'team_plan_v1'
>;

export type FeatureName = UserFeatureName | WorkspaceFeatureName;
export type FeatureConfig<T extends FeatureName> = z.infer<
  (typeof FeaturesShapes)[T]
>;

export const FeatureConfigs: {
  [K in FeatureName]: {
    type: FeatureType;
    configs: FeatureConfig<K>;
    deprecatedVersion: number;
  };
} = {
  free_plan_v1: {
    type: FeatureType.Quota,
    deprecatedVersion: 4,
    configs: {
      // quota name
      name: 'Free',
      blobLimit: 10 * OneMB,
      businessBlobLimit: 100 * OneMB,
      storageQuota: 10 * OneGB,
      historyPeriod: 7 * OneDay,
      memberLimit: 3,
      copilotActionLimit: 10,
    },
  },
  pro_plan_v1: {
    type: FeatureType.Quota,
    deprecatedVersion: 2,
    configs: {
      name: 'Pro',
      blobLimit: 100 * OneMB,
      storageQuota: 100 * OneGB,
      historyPeriod: 30 * OneDay,
      memberLimit: 10,
      copilotActionLimit: 10,
    },
  },
  lifetime_pro_plan_v1: {
    type: FeatureType.Quota,
    deprecatedVersion: 1,
    configs: {
      name: 'Lifetime Pro',
      blobLimit: 100 * OneMB,
      storageQuota: 1024 * OneGB,
      historyPeriod: 30 * OneDay,
      memberLimit: 10,
      copilotActionLimit: 10,
    },
  },
  team_plan_v1: {
    type: FeatureType.Quota,
    deprecatedVersion: 1,
    configs: {
      name: 'Team Workspace',
      blobLimit: 500 * OneMB,
      storageQuota: 100 * OneGB,
      seatQuota: 20 * OneGB,
      historyPeriod: 30 * OneDay,
      memberLimit: 1,
    },
  },
  early_access: {
    type: FeatureType.Feature,
    deprecatedVersion: 2,
    configs: { whitelist: [] },
  },
  unlimited_workspace: {
    type: FeatureType.Feature,
    deprecatedVersion: 1,
    configs: {},
  },
  unlimited_copilot: {
    type: FeatureType.Feature,
    deprecatedVersion: 1,
    configs: {},
  },
  ai_early_access: {
    type: FeatureType.Feature,
    deprecatedVersion: 1,
    configs: {},
  },
  administrator: {
    type: FeatureType.Feature,
    deprecatedVersion: 1,
    configs: {},
  },
};
