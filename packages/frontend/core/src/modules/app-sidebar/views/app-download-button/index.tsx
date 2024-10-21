import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { track } from '@affine/track';
import { CloseIcon, DownloadIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useCallback, useState, useEffect } from 'react';

import * as styles from './index.css';

// Although it is called an input, it is actually a button.
export function AppDownloadButton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [show, setShow] = useState(null);

  useEffect(() => {
    const isClosed = localStorage.getItem('appDownloadClosed') === 'true';
    setShow(!isClosed);
  }, []);

  const handleClose = useCatchEventCallback(() => {
    setShow(false);
    localStorage.setItem('appDownloadClosed', 'true');
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
        <span className={styles.ellipsisTextOverflow}>Download App</span>
      </div>
      <div className={styles.closeIcon} onClick={handleClose}>
        <CloseIcon />
      </div>
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
    </button>
  );
}
