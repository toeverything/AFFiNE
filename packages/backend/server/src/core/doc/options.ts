import { Injectable } from '@nestjs/common';

import { Config } from '../../base';
import { QuotaService } from '../quota/service';
import { mergeUpdatesWithNative, mergeUpdatesWithYjs } from './merge-updates';
import { DocStorageOptions as IDocStorageOptions } from './storage';

@Injectable()
export class DocStorageOptions implements IDocStorageOptions {
  constructor(
    private readonly config: Config,
    private readonly quota: QuotaService
  ) {}

  mergeUpdates = (updates: Uint8Array[]) =>
    this.config.doc.experimental.yocto
      ? mergeUpdatesWithNative(updates, 'doc.options.merge_updates')
      : mergeUpdatesWithYjs(updates, 'doc.options.merge_updates');

  historyMaxAge = async (spaceId: string) => {
    const quota = await this.quota.getWorkspaceQuota(spaceId);
    return quota.historyPeriod * 1000;
  };

  historyMinInterval = (_spaceId: string) => {
    return this.config.doc.history.interval;
  };
}
