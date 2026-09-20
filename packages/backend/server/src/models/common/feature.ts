import { z } from 'zod';

export interface UserQuota {
  name: string;
  blobLimit: number;
  businessBlobLimit?: number;
  storageQuota: number;
  historyPeriod: number;
  memberLimit: number;
  copilotActionLimit?: number;
}

export interface WorkspaceQuota extends UserQuota {
  seatQuota: number;
}

export enum FeatureType {
  Feature,
  Quota,
}

export enum Feature {
  Admin = 'administrator',
}

export const FeaturesShapes = {
  administrator: z.object({}),
};

export type UserFeatureName = 'administrator';
export type FeatureName = UserFeatureName;
export type FeatureConfig<T extends FeatureName> = z.infer<
  (typeof FeaturesShapes)[T]
>;

export const FeatureConfigs = {
  administrator: {
    type: FeatureType.Feature,
    configs: {},
  },
} satisfies Record<
  FeatureName,
  { type: FeatureType; configs: FeatureConfig<FeatureName> }
>;
