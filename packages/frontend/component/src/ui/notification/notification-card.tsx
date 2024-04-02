import { CloseIcon, InformationFillDuotoneIcon } from '@blocksuite/icons';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { type HTMLAttributes, useCallback } from 'react';

import { Button, IconButton } from '../button';
import * as styles from './styles.css';
import type { Notification } from './types';
import {
  getActionTextColor,
  getCardBorderColor,
  getCardColor,
  getCardForegroundColor,
} from './utils';

export interface NotificationCardProps extends HTMLAttributes<HTMLDivElement> {
  notification: Notification;
  onDismiss?: () => void;
}

export const NotificationCard = ({
  notification,
  onDismiss,
}: NotificationCardProps) => {
  const {
    theme = 'info',
    style = 'normal',
    icon = <InformationFillDuotoneIcon />,
    action,
    title,
    footer,
  } = notification;

  const onActionClicked = useCallback(() => {
    action?.onClick()?.catch(console.error);
    if (action?.autoClose !== false) {
      onDismiss?.();
    }
  }, [action, onDismiss]);

  return (
    <div
      style={assignInlineVars({
        [styles.cardColor]: getCardColor(style, theme),
        [styles.cardBorderColor]: getCardBorderColor(style),
        [styles.cardForeground]: getCardForegroundColor(style),
        [styles.actionTextColor]: getActionTextColor(style, theme),
      })}
      data-with-icon={icon ? '' : undefined}
      className={styles.card}
    >
      <header className={styles.header}>
        {icon ? (
          <div className={clsx(styles.icon, styles.headAlignWrapper)}>
            {icon}
          </div>
        ) : null}
        <div className={styles.title}>{title}</div>

        {action ? (
          <div className={clsx(styles.headAlignWrapper, styles.action)}>
            <Button
              className={styles.actionButton}
              onClick={onActionClicked}
              {...action.buttonProps}
            >
              {action.label}
            </Button>
          </div>
        ) : null}
        <div className={styles.headAlignWrapper}>
          <IconButton onClick={onDismiss}>
            <CloseIcon className={styles.closeIcon} width={16} height={16} />
          </IconButton>
        </div>
      </header>
      <main className={styles.main}>{notification.message}</main>
      <footer>{footer}</footer>
    </div>
  );
};
