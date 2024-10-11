import { CloseIcon, InformationFillDuotoneIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useCallback } from 'react';

import { Button, IconButton } from '../../button';
import type { NotificationCardProps } from '../types';
import { getCardVars } from '../utils';
import * as styles from './styles.css';

export const DesktopNotificationCard = ({
  notification,
}: NotificationCardProps) => {
  const {
    theme = 'info',
    style = 'normal',
    icon = <InformationFillDuotoneIcon />,
    iconColor,
    thumb,
    action,
    title,
    footer,
    alignMessage = 'title',
    onDismiss,
    rootAttrs,
  } = notification;

  const onActionClicked = useCallback(() => {
    action?.onClick()?.catch(console.error);
    if (action?.autoClose !== false) {
      onDismiss?.();
    }
  }, [action, onDismiss]);

  return (
    <div
      style={getCardVars(style, theme, iconColor)}
      data-with-icon={icon ? '' : undefined}
      {...rootAttrs}
      className={clsx(styles.card, rootAttrs?.className)}
    >
      {thumb}
      <div className={styles.cardInner}>
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
          <div
            data-float={!!thumb}
            className={clsx(styles.headAlignWrapper, styles.closeButton)}
          >
            <IconButton
              data-testid="notification-close-button"
              onClick={onDismiss}
            >
              <CloseIcon className={styles.closeIcon} width={16} height={16} />
            </IconButton>
          </div>
        </header>
        <main data-align={alignMessage} className={styles.main}>
          {notification.message}
        </main>
        <footer>{footer}</footer>
      </div>
    </div>
  );
};
