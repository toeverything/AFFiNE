import { Button, notify } from '@affine/component';
import { useI18n } from '@affine/i18n';
import clsx from 'clsx';
import { useCallback, useRef } from 'react';

import {
  actionButton,
  cancelButton,
  confirmButton,
  notifyFooter,
  notifyHeader,
} from './notify.css';

interface SubscriptionChangedNotifyFooterProps {
  onCancel: () => void;
  onConfirm?: () => void;
  to: string;
  okText: string;
  cancelText: string;
}

const SubscriptionChangedNotifyFooter = ({
  to,
  okText,
  cancelText,
  onCancel,
  onConfirm,
}: SubscriptionChangedNotifyFooterProps) => {
  return (
    <div className={notifyFooter}>
      <Button
        className={clsx(actionButton, cancelButton)}
        size={'default'}
        onClick={onCancel}
        variant="plain"
      >
        {cancelText}
      </Button>
      <a href={to} target="_blank" rel="noreferrer">
        <Button
          onClick={onConfirm}
          className={clsx(actionButton, confirmButton)}
          variant="plain"
        >
          {okText}
        </Button>
      </a>
    </div>
  );
};

export const useDowngradeNotify = () => {
  const t = useI18n();
  const prevNotifyIdRef = useRef<string | number | null>(null);

  return useCallback(
    (link: string) => {
      prevNotifyIdRef.current && notify.dismiss(prevNotifyIdRef.current);
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
          footer: (
            <SubscriptionChangedNotifyFooter
              to={link}
              okText={
                BUILD_CONFIG.isElectron
                  ? t['com.affine.payment.downgraded-notify.ok-client']()
                  : t['com.affine.payment.downgraded-notify.ok-web']()
              }
              cancelText={t['com.affine.payment.downgraded-notify.later']()}
              onCancel={() => notify.dismiss(id)}
              onConfirm={() => notify.dismiss(id)}
            />
          ),
        },
        { duration: 24 * 60 * 60 * 1000 }
      );
      prevNotifyIdRef.current = id;
    },
    [t]
  );
};
