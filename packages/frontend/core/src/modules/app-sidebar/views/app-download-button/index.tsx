import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { CloseIcon, DownloadIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useCallback, useState } from 'react';

import * as styles from './index.css';

export function AppDownloadButton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = useI18n();
  const [show, setShow] = useState(true);

  const handleClose = useCatchEventCallback(() => {
    setShow(false);
  }, []);

  // TODO(@JimmFly): unify this type of literal value.
  const handleClick = useCallback(() => {
    track.$.navigationPanel.bottomButtons.downloadApp();
    const url = `https://affine.pro/download?channel=stable`;
    open(url, '_blank');
  }, []);

  if (!show) {
    return null;
  }
  return (
    <button
      style={style}
      className={clsx([styles.root, styles.rootPadding, className])}
      onClick={handleClick}
    >
      <div className={clsx([styles.label])}>
        <DownloadIcon className={styles.icon} />
        <span className={styles.ellipsisTextOverflow}>
          {t['com.affine.auth.open.affine.download-app']()}
        </span>
      </div>
      <div className={styles.closeIcon} onClick={handleClose}>
        <CloseIcon />
      </div>
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
    </button>
  );
}
