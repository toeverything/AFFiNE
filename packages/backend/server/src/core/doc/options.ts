import { Injectable, Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';
import * as Y from 'yjs';

import { CallMetric, Config, metrics } from '../../base';
import { mergeUpdatesInApplyWay as yoctoMergeUpdates } from '../../native';
import { QuotaService } from '../quota';
import { DocStorageOptions as IDocStorageOptions } from './storage';

function compare(yBinary: Buffer, jwstBinary: Buffer, strict = false): boolean {
  if (yBinary.equals(jwstBinary)) {
    return true;
  }

  if (strict) {
    return false;
  }

  const doc = new Y.Doc();
  Y.applyUpdate(doc, jwstBinary);

  const yBinary2 = Buffer.from(Y.encodeStateAsUpdate(doc));

  return compare(yBinary, yBinary2, true);
}

@Injectable()
export class DocStorageOptions implements IDocStorageOptions {
  private readonly logger = new Logger('DocStorageOptions');

  constructor(
    private readonly config: Config,
    private readonly quota: QuotaService
  ) {}

  mergeUpdates = async (updates: Uint8Array[]) => {
    const doc = await this.recoverDoc(updates);
    const yjsResult = Buffer.from(Y.encodeStateAsUpdate(doc));

    if (this.config.doc.experimental.yocto) {
      metrics.jwst.counter('codec_merge_counter').add(1);
      let log = false;
      let yoctoResult: Buffer | null = null;
      try {
        yoctoResult = yoctoMergeUpdates(updates.map(Buffer.from));
        if (!compare(yjsResult, yoctoResult)) {
          metrics.jwst.counter('codec_not_match').add(1);
          this.logger.warn(`yocto codec result doesn't match yjs codec result`);
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

  @CallMetric('doc', 'yjs_recover_updates_to_doc')
  private recoverDoc(updates: Uint8Array[]): Promise<Y.Doc> {
    const doc = new Y.Doc();
    const chunks = chunk(updates, 10);
    let i = 0;

    return new Promise(resolve => {
      Y.transact(doc, () => {
        const next = () => {
          const updates = chunks.at(i++);

          if (updates?.length) {
            updates.forEach(u => {
              try {
                Y.applyUpdate(doc, u);
              } catch (e) {
                this.logger.error('Failed to apply update', e);
              }
            });

            // avoid applying too many updates in single round which will take the whole cpu time like dead lock
            setImmediate(() => {
              next();
            });
          } else {
            resolve(doc);
          }
        };

        next();
      });
    });
  }
}
