import { Field, Int, ObjectType } from '@nestjs/graphql';
import { z } from 'zod';

import { commonFeatureSchema, FeatureKind } from '../features';
import { ByteUnit, OneDay, OneKB } from './constant';

/// ======== quota define ========

export enum QuotaType {
  FreePlanV1 = 'free_plan_v1',
  ProPlanV1 = 'pro_plan_v1',
  // only for test, smaller quota
  RestrictedPlanV1 = 'restricted_plan_v1',
}

const quotaPlan = z.object({
  feature: z.enum([
    QuotaType.FreePlanV1,
    QuotaType.ProPlanV1,
    QuotaType.RestrictedPlanV1,
  ]),
  configs: z.object({
    name: z.string(),
    blobLimit: z.number().positive().int(),
    storageQuota: z.number().positive().int(),
    historyPeriod: z.number().positive().int(),
    memberLimit: z.number().positive().int(),
  }),
});

/// ======== schema infer ========

export const QuotaSchema = commonFeatureSchema
  .extend({
    type: z.literal(FeatureKind.Quota),
  })
  .and(z.discriminatedUnion('feature', [quotaPlan]));

export type Quota = z.infer<typeof QuotaSchema>;

/// ======== query types ========

@ObjectType()
export class QuotaQueryType {
  @Field(() => Int)
  storageQuota!: number;

  @Field(() => Int)
  usedSize!: number;

  @Field(() => Int)
  blobLimit!: number;
}

/// ======== utils ========

export function formatSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';

  const dm = decimals < 0 ? 0 : decimals;

  const i = Math.floor(Math.log(bytes) / Math.log(OneKB));

  return (
    parseFloat((bytes / Math.pow(OneKB, i)).toFixed(dm)) + ' ' + ByteUnit[i]
  );
}

export function formatDate(ms: number): string {
  return `${(ms / OneDay).toFixed(0)} days`;
}
