import { useI18n } from '@affine/i18n';
import { CloseIcon, InformationFillDuotoneIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useCallback } from 'react';

import { Button, IconButton } from '../../button';
import { FlexWrapper } from '../../layout/wrapper';
import type { NotificationActionProps, NotificationCardProps } from '../types';
import { getCardVars } from '../utils';
import * as styles from './styles.css';

export const DesktopNotificationCard = ({
  notification,
}: NotificationCardProps) => {
  const t = useI18n();
  const {
    theme = 'info',
    style = 'normal',
    icon = <InformationFillDuotoneIcon />,
    iconColor,
    thumb,
    actions,
    error,
    title,
    alignMessage = 'title',
    onDismiss,
    rootAttrs,
  } = notification;

  const errorI18nKey = error ? (`error.${error.name}` as const) : undefined;
  const errorTitle =
    errorI18nKey && errorI18nKey in t
      ? t[errorI18nKey](error?.data)
      : undefined;

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
          <div className={styles.title}>{title || errorTitle}</div>
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
        {notification.message ? (
          <main data-align={alignMessage} className={styles.main}>
            {notification.message}
          </main>
        ) : null}
        {actions?.length ? (
          <footer>
            <FlexWrapper marginTop={8} justifyContent="flex-end" gap="12px">
              {actions?.map(action => (
                <NotificationCardAction
                  key={action.key}
                  action={action}
                  onDismiss={onDismiss}
                />
              ))}
            </FlexWrapper>
          </footer>
        ) : null}
      </div>
    </div>
  );
};

const NotificationCardAction = ({
  action,
  onDismiss,
}: NotificationActionProps) => {
  const onActionClicked = useCallback(() => {
    action.onClick()?.catch(console.error);
    if (action.autoClose !== false) {
      onDismiss?.();
    }
  }, [action, onDismiss]);

  return (
    <Button
      variant="plain"
      data-testid={action.key}
      className={styles.actionButton}
      onClick={onActionClicked}
      {...action.buttonProps}
    >
      {action.label}
    </Button>
  );
};
