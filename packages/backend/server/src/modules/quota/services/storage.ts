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
        blobSingle: quota.feature.configs.blob_single_limit,
        blobTotal: quota.feature.configs.blob_total_limit,
      };
    }
    return null;
  }
}
