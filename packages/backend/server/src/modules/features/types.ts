import type { Prisma } from '@prisma/client';

export enum FeatureKind {
  Feature,
  Quota,
}

export type CommonFeature = {
  feature: string;
  type: FeatureKind;
  version: number;
  configs: Prisma.InputJsonValue;
};

export type Feature = CommonFeature & {
  type: FeatureKind.Feature;
  feature: FeatureType;
};

export enum FeatureType {
  Feature_EarlyAccess = 'early_access',
}
