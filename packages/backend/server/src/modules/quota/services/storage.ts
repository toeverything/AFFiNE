import { Injectable } from '@nestjs/common';

import { QuotaService } from '../quota';

@Injectable()
export class StorageQuotaService {
  constructor(private readonly quota: QuotaService) {}

  async getStorageQuotaByUser(userId: string) {
    const quota = await this.quota.getQuotaByUser(userId);
    if (quota) {
      return {
        name: quota.feature.feature,
        reason: quota.reason,
        createAt: quota.createdAt,
        expiresAt: quota.expiresAt,
        blobLimit: quota.feature.configs.blobLimit,
        storageQuota: quota.feature.configs.storageQuota,
      };
    }
    return null;
  }
}
