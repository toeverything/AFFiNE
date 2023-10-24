import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import clsx from 'clsx';
import { useMemo } from 'react';

import * as styles from './share.css';

export interface StorageProgressProgress {
  max: number;
  value: number;
  onUpgrade: () => void;
  plan: string;
}

const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

const transformBytes = (bytes: number) => {
  const magnitude = Math.min(
    (Math.log(bytes) / Math.log(1024)) | 0,
    units.length - 1
  );
  const result = bytes / Math.pow(1024, magnitude);
  return [Number(result.toFixed(2)), units[magnitude]];
};

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

  const [used, usedUnit] = useMemo(() => transformBytes(value), [value]);
  const [max, maxUnit] = useMemo(
    () => transformBytes(upperLimit),
    [upperLimit]
  );

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
            {used}
            {usedUnit}/{max}
            {maxUnit}
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
