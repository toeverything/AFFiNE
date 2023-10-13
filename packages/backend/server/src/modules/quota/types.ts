import type { Prisma } from '@prisma/client';

export enum FeatureKind {
  Feature,
  Quota,
}

export type Feature = {
  name: string;
  type: FeatureKind;
  version: number;
  configs: Prisma.InputJsonValue;
};

export type Quota = Feature & {
  type: FeatureKind.Quota;
  configs: {
    blob_single_limit: number;
    blob_total_limit: number;
  };
};
