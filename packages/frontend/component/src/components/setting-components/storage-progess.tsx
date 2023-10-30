import { SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import bytes from 'bytes';
import clsx from 'clsx';
import { useMemo } from 'react';

import * as styles from './share.css';

export interface StorageProgressProgress {
  max: number;
  value: number;
  onUpgrade: () => void;
  plan: SubscriptionPlan;
}

enum ButtonType {
  Primary = 'primary',
  Default = 'default',
}

export const StorageProgress = ({
  max: upperLimit,
  value,
  onUpgrade,
  plan,
}: StorageProgressProgress) => {
  const t = useAFFiNEI18N();
  const percent = useMemo(
    () => Math.round((value / upperLimit) * 100),
    [upperLimit, value]
  );

  const used = useMemo(() => bytes.format(value), [value]);
  const max = useMemo(() => bytes.format(upperLimit), [upperLimit]);

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
            {used}/{max}
            {` (${plan} ${t['com.affine.storage.plan']()})`}
          </span>
        </div>

        <div className="storage-progress-bar-wrapper">
          <div
            className={clsx(styles.storageProgressBar, {
              danger: percent > 80,
            })}
            style={{ width: `${percent > 100 ? '100' : percent}%` }}
          ></div>
        </div>
      </div>

      <Tooltip
        options={{ hidden: percent < 100 }}
        content={t['com.affine.storage.maximum-tips']()}
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
    </div>
  );
};
