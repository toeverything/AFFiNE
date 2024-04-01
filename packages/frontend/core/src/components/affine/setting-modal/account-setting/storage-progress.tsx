import { Button, Tooltip } from '@affine/component';
import { useCloudStorageUsage } from '@affine/core/hooks/affine/use-cloud-storage-usage';
import { SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMemo } from 'react';

import * as styles from './storage-progress.css';

export interface StorageProgressProgress {
  upgradable?: boolean;
  onUpgrade: () => void;
}

enum ButtonType {
  Primary = 'primary',
  Default = 'default',
}

export const StorageProgress = ({
  upgradable = true,
  onUpgrade,
}: StorageProgressProgress) => {
  const t = useAFFiNEI18N();
  const { plan, usedText, color, percent, maxLimitText } =
    useCloudStorageUsage();

  const buttonType = useMemo(() => {
    if (plan === SubscriptionPlan.Free) {
      return ButtonType.Primary;
    }
    return ButtonType.Default;
  }, [plan]);

  return (
    <div className={styles.storageProgressContainer}>
      <div className={styles.storageProgressWrapper}>
        <div className="storage-progress-desc">
          <span>{t['com.affine.storage.used.hint']()}</span>
          <span>
            {usedText}/{maxLimitText}
            {` (${plan} ${t['com.affine.storage.plan']()})`}
          </span>
        </div>

        <div className="storage-progress-bar-wrapper">
          <div
            className={styles.storageProgressBar}
            style={{ width: `${percent}%`, backgroundColor: color }}
          ></div>
        </div>
      </div>

      {upgradable ? (
        <Tooltip
          options={{ hidden: percent < 100 }}
          content={
            plan === 'Free'
              ? t['com.affine.storage.maximum-tips']()
              : t['com.affine.storage.maximum-tips.pro']()
          }
        >
          <span tabIndex={0}>
            <Button
              type={buttonType}
              onClick={onUpgrade}
              className={styles.storageButton}
            >
              {plan === 'Free'
                ? t['com.affine.storage.upgrade']()
                : t['com.affine.storage.change-plan']()}
            </Button>
          </span>
        </Tooltip>
      ) : null}
    </div>
  );
};
