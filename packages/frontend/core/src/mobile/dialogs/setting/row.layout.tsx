import { ConfigModal } from '@affine/core/components/mobile';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type { KeyboardEvent, PropsWithChildren, ReactNode } from 'react';
import { useCallback } from 'react';

import * as styles from './style.css';

export const RowLayout = ({
  label,
  children,
  href,
  onClick,
}: PropsWithChildren<{
  label: ReactNode;
  href?: string;
  onClick?: () => void;
}>) => {
  const isInteractive = !!href || !!onClick;

  const handleTrigger = useCallback(() => {
    if (onClick) {
      onClick();
      return;
    }

    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }, [href, onClick]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isInteractive) {
        return;
      }

      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      handleTrigger();
    },
    [handleTrigger, isInteractive]
  );

  return (
    <ConfigModal.Row
      data-testid="setting-row"
      className={clsx(styles.baseSettingItem, {
        [styles.interactiveRow]: isInteractive,
      })}
      onClick={isInteractive ? handleTrigger : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <div className={styles.baseSettingItemName}>{label}</div>
      <div className={styles.baseSettingItemAction}>
        {children ??
          (isInteractive ? (
            <ArrowRightSmallIcon className={styles.linkIcon} />
          ) : null)}
      </div>
    </ConfigModal.Row>
  );
};
