import { ConfirmModal } from '@affine/component/ui/modal';
import { useI18n } from '@affine/i18n';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { openPaymentDisableAtom } from '../../../atoms';
import * as styles from './style.css';

export const PaymentDisableModal = () => {
  const [open, setOpen] = useAtom(openPaymentDisableAtom);
  const t = useI18n();

  const onClickCancel = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <ConfirmModal
      title={t['com.affine.payment.disable-payment.title']()}
      cancelText=""
      cancelButtonOptions={{ style: { display: 'none' } }}
      confirmButtonOptions={{
        type: 'primary',
        children: t['Got it'](),
      }}
      onConfirm={onClickCancel}
      open={open}
      onOpenChange={setOpen}
    >
      <p className={styles.paymentDisableModalContent}>
        {t['com.affine.payment.disable-payment.description']()}
      </p>
    </ConfirmModal>
  );
};
