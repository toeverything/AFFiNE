import {
  Field,
  ObjectType,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { SafeIntResolver } from 'graphql-scalars';

import { CurrentUser } from '../auth/session';
import { EarlyAccessType } from '../features';
import { UserType } from '../user';
import { QuotaService } from './service';
import { QuotaManagementService } from './storage';

registerEnumType(EarlyAccessType, {
  name: 'EarlyAccessType',
});

@ObjectType('UserQuotaHumanReadable')
class UserQuotaHumanReadableType {
  @Field({ name: 'name' })
  name!: string;

  @Field({ name: 'blobLimit' })
  blobLimit!: string;

  @Field({ name: 'storageQuota' })
  storageQuota!: string;

  @Field({ name: 'historyPeriod' })
  historyPeriod!: string;

  @Field({ name: 'memberLimit' })
  memberLimit!: string;
}

@ObjectType('UserQuota')
class UserQuotaType {
  @Field({ name: 'name' })
  name!: string;

  @Field(() => SafeIntResolver, { name: 'blobLimit' })
  blobLimit!: number;

  @Field(() => SafeIntResolver, { name: 'storageQuota' })
  storageQuota!: number;

  @Field(() => SafeIntResolver, { name: 'historyPeriod' })
  historyPeriod!: number;

  @Field({ name: 'memberLimit' })
  memberLimit!: number;

  @Field({ name: 'humanReadable' })
  humanReadable!: UserQuotaHumanReadableType;
}

@ObjectType('UserQuotaUsage')
class UserQuotaUsageType {
  @Field(() => SafeIntResolver, { name: 'storageQuota' })
  storageQuota!: number;
}

@Resolver(() => UserType)
export class QuotaManagementResolver {
  constructor(
    private readonly quota: QuotaService,
    private readonly management: QuotaManagementService
  ) {}

  @ResolveField(() => UserQuotaType, { name: 'quota', nullable: true })
  async getQuota(@CurrentUser() me: UserType) {
    const quota = await this.quota.getUserQuota(me.id);

    return quota.feature;
  }

  @ResolveField(() => UserQuotaUsageType, { name: 'quotaUsage' })
  async getQuotaUsage(
    @CurrentUser() me: UserType
  ): Promise<UserQuotaUsageType> {
    const usage = await this.management.getUserStorageUsage(me.id);

    return {
      storageQuota: usage,
    };
  }
}
