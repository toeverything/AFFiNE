import { CloseIcon } from '@blocksuite/icons';
import { Button, IconButton } from '@toeverything/components/button';
import { useCallback } from 'react';

import * as styles from './index.css';

type DownloadTipsProps = {
  isLoggedIn: boolean;
  onLogin: () => void;
  onEnableCloud: () => void;
  onClose: () => void;
};

export const DownloadTips = ({
  onClose,
  isLoggedIn,
  onLogin,
  onEnableCloud,
}: DownloadTipsProps) => {
  const content = isLoggedIn
    ? 'This is a local demo workspace, and the data is stored locally. We recommend enabling AFFiNE Cloud.'
    : 'This is a local demo workspace, and the data is stored locally in the browser. We recommend Enabling AFFiNE Cloud or downloading the client for a better experience.';

  const buttonLabel = isLoggedIn
    ? 'Enable AFFiNE Cloud'
    : 'Sign in with AFFiNE Cloud';

  const handleClick = useCallback(() => {
    if (isLoggedIn) {
      return onEnableCloud();
    }
    return onLogin();
  }, [isLoggedIn, onEnableCloud, onLogin]);

  return (
    <div
      className={styles.downloadTipContainer}
      data-testid="download-client-tip"
    >
      <div className={styles.downloadMessage}>{content}</div>

      <div className={styles.downloadRightItem}>
        <div>
          <Button onClick={handleClick}>{buttonLabel}</Button>
        </div>
        <IconButton
          onClick={onClose}
          data-testid="download-client-tip-close-button"
        >
          <CloseIcon />
        </IconButton>
      </div>
    </div>
  );
};

export default DownloadTips;
