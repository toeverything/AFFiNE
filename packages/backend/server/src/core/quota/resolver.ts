import { ResolveField, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../auth/session';
import { UserType } from '../user';
import { QuotaService } from './service';
import { UserQuotaType, UserQuotaUsageType } from './types';

@Resolver(() => UserType)
export class QuotaResolver {
  constructor(private readonly quota: QuotaService) {}

  @ResolveField(() => UserQuotaType, { name: 'quota' })
  async getQuota(@CurrentUser() me: UserType): Promise<UserQuotaType> {
    const quota = await this.quota.getUserQuotaWithUsage(me.id);

    return {
      ...quota,
      humanReadable: this.quota.formatUserQuota(quota),
    };
  }

  @ResolveField(() => UserQuotaUsageType, { name: 'quotaUsage' })
  async getQuotaUsage(
    @CurrentUser() me: UserType
  ): Promise<UserQuotaUsageType> {
    const usage = await this.quota.getUserStorageUsage(me.id);

    return {
      storageQuota: usage,
    };
  }
}
