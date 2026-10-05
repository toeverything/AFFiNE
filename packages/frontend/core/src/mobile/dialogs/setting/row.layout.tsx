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
  const isLinkRow = !!href && !onClick;
  const isButtonRow = !!onClick;
  const isInteractive = isLinkRow || isButtonRow;

  const handleTrigger = useCallback(() => {
    onClick?.();
  }, [onClick]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isButtonRow) {
        return;
      }

      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      handleTrigger();
    },
    [handleTrigger, isButtonRow]
  );

  const content = (
    <>
      <div className={styles.baseSettingItemName}>{label}</div>
      <div className={styles.baseSettingItemAction}>
        {children ??
          (isInteractive ? (
            <ArrowRightSmallIcon className={styles.linkIcon} />
          ) : null)}
      </div>
    </>
  );

  return (
    <ConfigModal.Row
      data-testid="setting-row"
      className={clsx(styles.baseSettingItem, {
        [styles.interactiveRow]: isInteractive,
      })}
      onClick={isButtonRow ? handleTrigger : undefined}
      onKeyDown={isButtonRow ? handleKeyDown : undefined}
      role={isButtonRow ? 'button' : undefined}
      tabIndex={isButtonRow ? 0 : undefined}
    >
      {isLinkRow ? (
        <a
          className={styles.linkRowContent}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {content}
        </a>
      ) : (
        content
      )}
    </ConfigModal.Row>
  );
};
