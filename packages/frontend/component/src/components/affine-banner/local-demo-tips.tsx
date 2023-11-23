import { CloseIcon } from '@blocksuite/icons';
import { Button, IconButton } from '@toeverything/components/button';
import { useCallback } from 'react';

import * as styles from './index.css';

type LocalDemoTipsProps = {
  isLoggedIn: boolean;
  onLogin: () => void;
  onEnableCloud: () => void;
  onClose: () => void;
};

export const LocalDemoTips = ({
  onClose,
  isLoggedIn,
  onLogin,
  onEnableCloud,
}: LocalDemoTipsProps) => {
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
    <div className={styles.tipsContainer} data-testid="local-demo-tips">
      <div className={styles.tipsMessage}>{content}</div>

      <div className={styles.tipsRightItem}>
        <div>
          <Button onClick={handleClick}>{buttonLabel}</Button>
        </div>
        <IconButton
          onClick={onClose}
          data-testid="local-demo-tips-close-button"
        >
          <CloseIcon />
        </IconButton>
      </div>
    </div>
  );
};

export default LocalDemoTips;
