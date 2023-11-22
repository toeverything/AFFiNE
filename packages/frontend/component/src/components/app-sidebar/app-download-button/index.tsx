import { CloseIcon, DownloadIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { useCallback, useState } from 'react';

import * as styles from './index.css';

// Although it is called an input, it is actually a button.
export function AppDownloadButton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [show, setShow] = useState(true);

  const handleClose = useCallback(() => {
    setShow(false);
  }, []);

  const handleClick = useCallback(() => {
    const url = `https://affine.pro/download?channel=stable`;
    open(url, '_blank');
  }, []);

  if (!show) {
    return null;
  }
  return (
    <button
      style={style}
      className={clsx([styles.root, className])}
      onClick={handleClick}
    >
      <div className={clsx([styles.label])}>
        <DownloadIcon className={styles.icon} />
        <span className={styles.ellipsisTextOverflow}>Download App</span>
      </div>
      <div
        className={styles.closeIcon}
        onClick={e => {
          e.stopPropagation();
          handleClose();
        }}
      >
        <CloseIcon />
      </div>
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
    </button>
  );
}
