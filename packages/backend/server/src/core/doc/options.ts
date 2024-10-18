import { Injectable, Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';
import * as Y from 'yjs';

import {
  CallMetric,
  Config,
  mergeUpdatesInApplyWay as yotcoMergeUpdates,
  metrics,
} from '../../fundamentals';
import { PermissionService } from '../permission';
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
    private readonly permission: PermissionService,
    private readonly quota: QuotaService
  ) {}

  mergeUpdates = async (updates: Uint8Array[]) => {
    const useYocto = await this.config.runtime.fetch(
      'doc/experimentalMergeWithYOcto'
    );

    if (useYocto) {
      const doc = await this.recoverDoc(updates);

      metrics.jwst.counter('codec_merge_counter').add(1);
      const yjsResult = Buffer.from(Y.encodeStateAsUpdate(doc));
      let log = false;
      try {
        const yocto = yotcoMergeUpdates(updates.map(Buffer.from));
        if (!compare(yjsResult, yocto)) {
          metrics.jwst.counter('codec_not_match').add(1);
          this.logger.warn(`yocto codec result doesn't match yjs codec result`);
          log = true;
          if (this.config.node.dev) {
            this.logger.warn(`Expected:\n  ${yjsResult.toString('hex')}`);
            this.logger.warn(`Result:\n  ${yocto.toString('hex')}`);
          }
        }
      } catch (e) {
        metrics.jwst.counter('codec_fails_counter').add(1);
        this.logger.warn(`jwst apply update failed: ${e}`);
        log = true;
      }

      if (log && this.config.node.dev) {
        this.logger.warn(
          `Updates: ${updates.map(u => Buffer.from(u).toString('hex')).join('\n')}`
        );
      }

      return yjsResult;
    } else {
      return this.simpleMergeUpdates(updates);
    }
  };

  historyMaxAge = async (spaceId: string) => {
    const owner = await this.permission.getWorkspaceOwner(spaceId);
    const quota = await this.quota.getUserQuota(owner.id);
    return quota.feature.historyPeriod;
  };

  historyMinInterval = (_spaceId: string) => {
    return this.config.doc.history.interval;
  };

  @CallMetric('doc', 'yjs_merge_updates')
  private simpleMergeUpdates(updates: Uint8Array[]) {
    return Y.mergeUpdates(updates);
  }

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
