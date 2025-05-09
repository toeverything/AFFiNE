import { Field, ObjectType } from '@nestjs/graphql';
import { SafeIntResolver } from 'graphql-scalars';

import { UserQuota, WorkspaceQuota } from '../../models';

@ObjectType()
export class UserQuotaHumanReadableType {
  @Field()
  name!: string;

  @Field()
  blobLimit!: string;

  @Field()
  storageQuota!: string;

  @Field()
  usedStorageQuota!: string;

  @Field()
  historyPeriod!: string;

  @Field()
  memberLimit!: string;

  @Field()
  copilotActionLimit!: string;
}

@ObjectType()
export class UserQuotaType implements UserQuota {
  @Field()
  name!: string;

  @Field(() => SafeIntResolver)
  blobLimit!: number;

  @Field(() => SafeIntResolver)
  storageQuota!: number;

  @Field(() => SafeIntResolver)
  usedStorageQuota!: number;

  @Field(() => SafeIntResolver)
  historyPeriod!: number;

  @Field()
  memberLimit!: number;

  @Field(() => Number, { nullable: true })
  copilotActionLimit?: number;

  @Field(() => UserQuotaHumanReadableType)
  humanReadable!: UserQuotaHumanReadableType;
}

@ObjectType()
export class UserQuotaUsageType {
  @Field(() => SafeIntResolver, {
    name: 'storageQuota',
    deprecationReason: "use `UserQuotaType['usedStorageQuota']` instead",
  })
  storageQuota!: number;
}

@ObjectType()
export class WorkspaceQuotaHumanReadableType {
  @Field()
  name!: string;

  @Field()
  blobLimit!: string;

  @Field()
  storageQuota!: string;

  @Field()
  storageQuotaUsed!: string;

  @Field()
  historyPeriod!: string;

  @Field()
  memberLimit!: string;

  @Field()
  memberCount!: string;

  @Field()
  overcapacityMemberCount!: string;
}

@ObjectType()
export class WorkspaceQuotaType implements Partial<WorkspaceQuota> {
  @Field()
  name!: string;

  @Field(() => SafeIntResolver)
  blobLimit!: number;

  @Field(() => SafeIntResolver)
  storageQuota!: number;

  @Field(() => SafeIntResolver)
  usedStorageQuota!: number;

  @Field(() => SafeIntResolver)
  historyPeriod!: number;

  @Field()
  memberLimit!: number;

  @Field()
  memberCount!: number;

  @Field()
  overcapacityMemberCount!: number;

  @Field()
  humanReadable!: WorkspaceQuotaHumanReadableType;

  /**
   * @deprecated
   */
  @Field(() => SafeIntResolver, {
    deprecationReason: 'use `usedStorageQuota` instead',
  })
  usedSize!: number;
}
