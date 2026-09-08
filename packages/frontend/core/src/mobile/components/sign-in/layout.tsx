import { IconButton } from '@affine/component';
import { CloseIcon } from '@blocksuite/icons/rc';
import type { PropsWithChildren } from 'react';

import { SignInBackground } from './background';
import * as styles from './layout.css';

export const MobileSignInLayout = ({
  children,
  showCloseButton = false,
  onClose,
}: PropsWithChildren<{
  showCloseButton?: boolean;
  onClose?: () => void;
}>) => {
  const shouldShowDismissAffordance = showCloseButton && onClose;

  return (
    <div className={styles.root}>
      <SignInBackground />
      {shouldShowDismissAffordance ? (
        <IconButton
          className={styles.closeButton}
          size="24"
          variant="solid"
          icon={<CloseIcon />}
          style={{ borderRadius: 12, padding: 4 }}
          onClick={e => {
            e.stopPropagation();
            onClose?.();
          }}
        />
      ) : null}
      <div className={styles.content}>{children}</div>
    </div>
  );
};
