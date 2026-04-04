import { Injectable, Logger } from '@nestjs/common';

import { Config, metrics } from '../../base';
import { QuotaService } from '../quota';
import { compareCodecResult } from './codec-compare';
import { applyUpdatesWithNative, applyUpdatesWithYjs } from './merge-updates';
import { DocStorageOptions as IDocStorageOptions } from './storage';

@Injectable()
export class DocStorageOptions implements IDocStorageOptions {
  private readonly logger = new Logger('DocStorageOptions');

  constructor(
    private readonly config: Config,
    private readonly quota: QuotaService
  ) {}

  mergeUpdates = async (updates: Uint8Array[]) => {
    const yjsResult = await applyUpdatesWithYjs(
      updates,
      'doc.options.merge_updates',
      this.logger
    );

    if (this.config.doc.experimental.yocto) {
      metrics.jwst.counter('codec_merge_counter').add(1);
      let log = false;
      let yoctoResult: Buffer | null = null;
      try {
        yoctoResult = applyUpdatesWithNative(
          updates,
          'doc.options.yocto_codec_compare',
          this.logger
        );
        const comparison = compareCodecResult(yjsResult, yoctoResult);
        if (!comparison.matches) {
          metrics.jwst.counter('codec_not_match').add(1);
          this.logger.warn(`yocto codec result doesn't match yjs codec result`);
          if (comparison.treeDiff?.length) {
            this.logger.warn(
              `yocto codec tree diff:\n${comparison.treeDiff.join('\n')}`
            );
          }
          log = true;
          if (env.dev) {
            this.logger.warn(`Expected:\n  ${yjsResult.toString('hex')}`);
            this.logger.warn(`Result:\n  ${yoctoResult.toString('hex')}`);
          }
        }
      } catch (e) {
        metrics.jwst.counter('codec_fails_counter').add(1);
        this.logger.warn(`jwst apply update failed: ${e}`);
        log = true;
      }

      if (log && env.dev) {
        this.logger.warn(
          `Updates: ${updates.map(u => Buffer.from(u).toString('hex')).join('\n')}`
        );
      }

      if (
        env.namespaces.canary &&
        yoctoResult &&
        yoctoResult.length > 2 /* simple test for non-empty yjs binary */
      ) {
        return yoctoResult;
      }
    }

    return yjsResult;
  };

  historyMaxAge = async (spaceId: string) => {
    const quota = await this.quota.getWorkspaceQuota(spaceId);
    return quota.historyPeriod;
  };

  historyMinInterval = (_spaceId: string) => {
    return this.config.doc.history.interval;
  };
}
