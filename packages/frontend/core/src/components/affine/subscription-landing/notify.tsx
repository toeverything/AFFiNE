import { type Notification, notify } from '@affine/component';
import { useI18n } from '@affine/i18n';
import clsx from 'clsx';
import { useCallback, useRef } from 'react';

import {
  actionButton,
  cancelButton,
  confirmButton,
  notifyHeader,
} from './notify.css';

export const useDowngradeNotify = () => {
  const t = useI18n();
  const prevNotifyIdRef = useRef<string | number | null>(null);

  return useCallback(
    (link: string) => {
      prevNotifyIdRef.current && notify.dismiss(prevNotifyIdRef.current);

      const actions: Notification['actions'] = [
        {
          key: 'later',
          label: t['com.affine.payment.downgraded-notify.later'](),
          onClick: () => {},
          buttonProps: {
            className: clsx(actionButton, cancelButton),
          },
        },
        {
          key: 'ok',
          label: BUILD_CONFIG.isElectron
            ? t['com.affine.payment.downgraded-notify.ok-client']()
            : t['com.affine.payment.downgraded-notify.ok-web'](),
          onClick: () => {
            window.open(link, '_blank', 'noreferrer');
          },
          buttonProps: {
            className: clsx(actionButton, confirmButton),
          },
        },
      ];

      const id = notify(
        {
          title: (
            <span className={notifyHeader}>
              {t['com.affine.payment.downgraded-notify.title']()}
            </span>
          ),
          message: t['com.affine.payment.downgraded-notify.content'](),
          alignMessage: 'title',
          icon: null,
          actions,
        },
        { duration: 24 * 60 * 60 * 1000 }
      );
      prevNotifyIdRef.current = id;
    },
    [t]
  );
};
