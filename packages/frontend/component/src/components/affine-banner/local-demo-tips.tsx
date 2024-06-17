import { Button, IconButton } from '@affine/component/ui/button';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon } from '@blocksuite/icons/rc';
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
  const t = useAFFiNEI18N();
  const buttonLabel = isLoggedIn
    ? t['Enable AFFiNE Cloud']()
    : t['Sign in and Enable']();

  const handleClick = useCallback(() => {
    if (isLoggedIn) {
      return onEnableCloud();
    }
    return onLogin();
  }, [isLoggedIn, onEnableCloud, onLogin]);

  return (
    <div className={styles.tipsContainer} data-testid="local-demo-tips">
      <div className={styles.tipsMessage}>
        {t['com.affine.banner.local-warning']()}
      </div>

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
