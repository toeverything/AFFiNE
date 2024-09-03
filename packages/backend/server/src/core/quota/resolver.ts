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

@Resolver(() => UserType)
export class QuotaManagementResolver {
  constructor(private readonly quota: QuotaService) {}

  @ResolveField(() => UserQuotaType, { name: 'quota', nullable: true })
  async getQuota(@CurrentUser() me: UserType) {
    const quota = await this.quota.getUserQuota(me.id);

    return quota.feature;
  }
}
