import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import clsx from 'clsx';
import { useMemo, useRef } from 'react';

import * as styles from './share.css';

export interface StorageProgressProgress {
  max: number;
  value: number;
  onUpgrade: () => void;
}

const transformBytesToMB = (bytes: number) => {
  return (bytes / 1024 / 1024).toFixed(2);
};

const transformBytesToGB = (bytes: number) => {
  return (bytes / 1024 / 1024 / 1024).toFixed(2);
};

export const StorageProgress = ({
  max: upperLimit,
  value,
  onUpgrade,
}: StorageProgressProgress) => {
  const t = useAFFiNEI18N();
  const ref = useRef(null);
  const percent = useMemo(
    () => Math.round((value / upperLimit) * 100),
    [upperLimit, value]
  );

  const used = useMemo(() => transformBytesToMB(value), [value]);
  const max = useMemo(() => transformBytesToGB(upperLimit), [upperLimit]);

  return (
    <>
      <div className={styles.storageProgressContainer}>
        <div className={styles.storageProgressWrapper}>
          <div className="storage-progress-desc">
            <span>{t['com.affine.storage.used.hint']()}</span>
            <span>
              {used}MB/{max}GB
            </span>
          </div>

          <div className="storage-progress-bar-wrapper">
            <div
              className={clsx(styles.storageProgressBar, {
                warning: percent > 80,
                danger: percent > 99,
              })}
              style={{ width: `${percent}%` }}
            ></div>
          </div>
        </div>

        <Tooltip
          content={t['com.affine.storage.disabled.hint']()}
          portalOptions={{
            container: ref.current,
          }}
        >
          <div ref={ref}>
            <Button disabled onClick={onUpgrade}>
              {t['com.affine.storage.upgrade']()}
            </Button>
          </div>
        </Tooltip>
      </div>
      {percent > 80 ? (
        <div className={styles.storageExtendHint}>
          {t['com.affine.storage.extend.hint']()}
          <a
            href="https://community.affine.pro/c/insider-general/"
            target="_blank"
            rel="noreferrer"
          >
            {t['com.affine.storage.extend.link']()}
          </a>
        </div>
      ) : null}
    </>
  );
};
