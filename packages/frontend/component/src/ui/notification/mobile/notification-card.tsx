import { useI18n } from '@affine/i18n';
import { CloseIcon, InformationFillDuotoneIcon } from '@blocksuite/icons/rc';
import { useCallback, useState } from 'react';

import { Button, IconButton } from '../../button';
import { Modal } from '../../modal';
import type { NotificationActionProps, NotificationCardProps } from '../types';
import { getCardVars } from '../utils';
import * as styles from './styles.css';

export function MobileNotificationCard({
  notification,
}: NotificationCardProps) {
  const {
    theme = 'info',
    style = 'normal',
    icon = <InformationFillDuotoneIcon />,
    iconColor,
    onDismiss,
    error,
  } = notification;
  const t = useI18n();
  const errorI18nKey = error ? (`error.${error.name}` as const) : undefined;
  const errorTitle =
    errorI18nKey && errorI18nKey in t
      ? t[errorI18nKey](error?.data)
      : undefined;

  const [animated, setAnimated] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const handleShowDetail = useCallback(() => {
    setAnimated(true);
    setShowDetail(true);
  }, []);
  const handleHideDetail = useCallback(() => {
    setShowDetail(false);
    onDismiss?.();
  }, [onDismiss]);

  return showDetail ? (
    <MobileNotifyDetail
      notification={notification}
      onClose={handleHideDetail}
    />
  ) : (
    <div
      data-animated={animated}
      onClick={handleShowDetail}
      className={styles.toastRoot}
      style={getCardVars(style, theme, iconColor)}
    >
      <span className={styles.toastIcon}>{icon}</span>
      <span className={styles.toastLabel}>
        {notification.title || errorTitle}
      </span>
    </div>
  );
}
const MobileNotifyDetail = ({
  notification,
  onClose,
}: NotificationCardProps & {
  onClose: () => void;
}) => {
  const {
    theme = 'info',
    style = 'normal',
    icon = <InformationFillDuotoneIcon />,
    iconColor,
    title,
    message,
    actions,
    error,
  } = notification;
  const t = useI18n();
  const errorI18nKey = error ? (`error.${error.name}` as const) : undefined;
  const errorTitle =
    errorI18nKey && errorI18nKey in t
      ? t[errorI18nKey](error?.data)
      : undefined;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose]
  );

  return (
    <Modal
      open
      withoutCloseButton
      width="100%"
      minHeight={60}
      animation="slideBottom"
      onOpenChange={handleOpenChange}
      contentWrapperStyle={getCardVars(style, theme, iconColor)}
      contentOptions={{ style: { padding: '12px 0' } }}
    >
      <div className={styles.detailCard} onClick={e => e.stopPropagation()}>
        <header className={styles.detailHeader}>
          <span className={styles.detailIcon}>{icon}</span>
          <span className={styles.detailLabel}>{title || errorTitle}</span>
          <IconButton onClick={onClose} icon={<CloseIcon />} />
        </header>
        <main className={styles.detailContent}>{message}</main>
        {/* actions */}
        <div className={styles.detailActions}>
          {actions?.map(action => (
            <NotificationCardAction
              key={action.key}
              action={action}
              onDismiss={onClose}
            />
          ))}
        </div>
      </div>
    </Modal>
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
    <Button onClick={onActionClicked} {...action.buttonProps}>
      {action.label}
    </Button>
  );
};
