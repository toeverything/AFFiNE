import { UserFriendlyError } from '@affine/error';
import {
  InformationFillDuotoneIcon,
  SingleSelectCheckSolidIcon,
} from '@blocksuite/icons/rc';
import type { FC } from 'react';
import { type ExternalToast, toast } from 'sonner';

import { DesktopNotificationCard } from './desktop/notification-card';
import { DesktopNotificationCenter } from './desktop/notification-center';
import { MobileNotificationCard } from './mobile/notification-card';
import { MobileNotificationCenter } from './mobile/notification-center';
import type { Notification, NotificationCustomRendererProps } from './types';

const NotificationCard = BUILD_CONFIG.isMobileEdition
  ? MobileNotificationCard
  : DesktopNotificationCard;

const NotificationCenter = BUILD_CONFIG.isMobileEdition
  ? MobileNotificationCenter
  : DesktopNotificationCenter;

export { NotificationCenter };

/**
 *
 * @returns {string} toastId
 */
export function notify(notification: Notification, options?: ExternalToast) {
  return toast.custom(id => {
    const onDismiss = () => {
      notification.onDismiss?.();
      toast.dismiss(id);
    };
    return <NotificationCard notification={{ ...notification, onDismiss }} />;
  }, options);
}

notify.error = (
  notification: Notification | UserFriendlyError,
  options?: ExternalToast
) => {
  if (notification instanceof UserFriendlyError) {
    notification = {
      error: notification,
    };
  }

  return notify(
    {
      icon: <InformationFillDuotoneIcon />,
      style: 'normal',
      theme: 'error',
      ...notification,
    },
    options
  );
};

notify.success = (notification: Notification, options?: ExternalToast) => {
  return notify(
    {
      icon: <SingleSelectCheckSolidIcon />,
      style: 'normal',
      theme: 'success',
      ...notification,
    },
    options
  );
};

notify.warning = (notification: Notification, options?: ExternalToast) => {
  return notify(
    {
      icon: <InformationFillDuotoneIcon />,
      style: 'normal',
      theme: 'warning',
      ...notification,
    },
    options
  );
};

notify.custom = (
  Component: FC<NotificationCustomRendererProps>,
  options?: ExternalToast
) => {
  return toast.custom(id => {
    return <Component onDismiss={() => toast.dismiss(id)} />;
  }, options);
};

notify.dismiss = toast.dismiss;
