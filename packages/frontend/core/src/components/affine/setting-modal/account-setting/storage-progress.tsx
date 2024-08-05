import { Button, ErrorMessage, Skeleton, Tooltip } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useEffect, useMemo } from 'react';

import {
  ServerConfigService,
  SubscriptionService,
  UserQuotaService,
} from '../../../../modules/cloud';
import * as styles from './storage-progress.css';

export interface StorageProgressProgress {
  upgradable?: boolean;
  onUpgrade: () => void;
}

enum ButtonType {
  Primary = 'primary',
  Default = 'secondary',
}

export const StorageProgress = ({ onUpgrade }: StorageProgressProgress) => {
  const t = useI18n();
  const quota = useService(UserQuotaService).quota;

  useEffect(() => {
    // revalidate quota to get the latest status
    quota.revalidate();
  }, [quota]);
  const color = useLiveData(quota.color$);
  const usedFormatted = useLiveData(quota.usedFormatted$);
  const maxFormatted = useLiveData(quota.maxFormatted$);
  const percent = useLiveData(quota.percent$);

  const serverConfigService = useService(ServerConfigService);
  const hasPaymentFeature = useLiveData(
    serverConfigService.serverConfig.features$.map(f => f?.payment)
  );
  const subscription = useService(SubscriptionService).subscription;
  useEffect(() => {
    // revalidate subscription to get the latest status
    subscription.revalidate();
  }, [subscription]);

  const proSubscription = useLiveData(subscription.pro$);
  const isFreeUser = !proSubscription;
  const quotaName = useLiveData(
    quota.quota$.map(q => (q !== null ? q?.humanReadable.name : null))
  );

  const loading =
    proSubscription === null || percent === null || quotaName === null;
  const loadError = useLiveData(quota.error$);

  const buttonType = useMemo(() => {
    if (isFreeUser) {
      return ButtonType.Primary;
    }
    return ButtonType.Default;
  }, [isFreeUser]);

  if (loading) {
    if (loadError) {
      // TODO(@catsjuice): i18n
      return <ErrorMessage>Load error</ErrorMessage>;
    }
    return <Skeleton height={42} />;
  }

  return (
    <div className={styles.storageProgressContainer}>
      <div className={styles.storageProgressWrapper}>
        <div className="storage-progress-desc">
          <span>{t['com.affine.storage.used.hint']()}</span>
          <span>
            {usedFormatted}/{maxFormatted}
            {` (${quotaName} ${t['com.affine.storage.plan']()})`}
          </span>
        </div>

        <div className="storage-progress-bar-wrapper">
          <div
            className={styles.storageProgressBar}
            style={{
              width: `${percent}%`,
              backgroundColor: color ?? cssVar('processingColor'),
            }}
          ></div>
        </div>
      </div>

      {hasPaymentFeature ? (
        <Tooltip
          options={{ hidden: percent < 100 }}
          content={
            isFreeUser
              ? t['com.affine.storage.maximum-tips']()
              : t['com.affine.storage.maximum-tips.pro']()
          }
        >
          <span tabIndex={0}>
            <Button variant={buttonType} onClick={onUpgrade}>
              {isFreeUser
                ? t['com.affine.storage.upgrade']()
                : t['com.affine.storage.change-plan']()}
            </Button>
          </span>
        </Tooltip>
      ) : null}
    </div>
  );
};
