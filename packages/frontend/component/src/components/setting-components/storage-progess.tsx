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
  plan: string;
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
    if (plan === 'Free') {
      return 'primary';
    }
    return 'default';
  }, [plan]);

  return (
    <div className={styles.storageProgressContainer}>
      <div className={styles.storageProgressWrapper}>
        <div className="storage-progress-desc">
          <span>{t['com.affine.storage.used.hint']()}</span>
          <span>
            {used}/{max}
            {` (${plan} Plan)`}
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
        content={
          'You have reached the maximum capacity limit for your current account'
        }
      >
        <span tabIndex={0}>
          <Button
            type={buttonType}
            onClick={onUpgrade}
            className={styles.storageButton}
          >
            {plan === 'Free' ? 'Upgrade' : 'Change'}
          </Button>
        </span>
      </Tooltip>
    </div>
  );
};
