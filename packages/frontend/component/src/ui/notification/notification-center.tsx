import { SingleSelectSelectSolidIcon } from '@blocksuite/icons';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { type CSSProperties, type FC, useMemo } from 'react';
import { type ExternalToast, toast, Toaster } from 'sonner';

import { NotificationCard } from './notification-card';
import type {
  Notification,
  NotificationCenterProps,
  NotificationCustomRendererProps,
} from './types';

export function NotificationCenter({ width = 380 }: NotificationCenterProps) {
  const style = useMemo(() => {
    return {
      ...assignInlineVars({
        // override css vars inside sonner
        '--width': `${width}px`,
      }),
      // radix-ui will lock pointer-events when dialog is open
      pointerEvents: 'auto',
    } satisfies CSSProperties;
  }, [width]);

  const toastOptions = useMemo(
    () => ({
      style: {
        width: '100%',
      },
    }),
    []
  );

  return (
    <Toaster
      className="affine-notification-center"
      style={style}
      toastOptions={toastOptions}
    />
  );
}

/**
 *
 * @returns {string} toastId
 */
export function notify(notification: Notification, options?: ExternalToast) {
  return toast.custom(id => {
    return (
      <NotificationCard
        notification={notification}
        onDismiss={() => toast.dismiss(id)}
      />
    );
  }, options);
}

notify.error = (notification: Notification, options?: ExternalToast) => {
  return notify({ style: 'alert', theme: 'error', ...notification }, options);
};

notify.success = (notification: Notification, options?: ExternalToast) => {
  return notify(
    {
      icon: <SingleSelectSelectSolidIcon />,
      style: 'alert',
      theme: 'success',
      ...notification,
    },
    options
  );
};

notify.warning = (notification: Notification, options?: ExternalToast) => {
  return notify(
    { style: 'information', theme: 'warning', ...notification },
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
