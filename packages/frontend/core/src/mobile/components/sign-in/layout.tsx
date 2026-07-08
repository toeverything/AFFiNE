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
      <div
        className={styles.content}
        style={{ gap: shouldShowDismissAffordance ? 16 : undefined }}
      >
        {shouldShowDismissAffordance ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <IconButton
              size="24"
              variant="solid"
              icon={<CloseIcon />}
              style={{ borderRadius: 8, padding: 4 }}
              onClick={e => {
                e.stopPropagation();
                onClose?.();
              }}
            />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};
