import { ConfirmModal } from '@affine/component/ui/modal';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useCallback } from 'react';

export interface MemberLimitModalProps {
  isFreePlan: boolean;
  open: boolean;
  plan: string;
  quota: string;
  setOpen: (value: boolean) => void;
  onConfirm: () => void;
}

export const MemberLimitModal = ({
  isFreePlan,
  open,
  plan,
  quota,
  setOpen,
  onConfirm,
}: MemberLimitModalProps) => {
  const t = useAFFiNEI18N();
  const handleConfirm = useCallback(() => {
    setOpen(false);
    if (isFreePlan) {
      onConfirm();
    }
  }, [onConfirm, setOpen, isFreePlan]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={setOpen}
      title={t['com.affine.payment.member-limit.title']()}
      description={t[
        isFreePlan
          ? 'com.affine.payment.member-limit.free.description'
          : 'com.affine.payment.member-limit.pro.description'
      ]({ planName: plan, quota: quota })}
      cancelButtonOptions={{ style: { display: isFreePlan ? '' : 'none' } }}
      confirmButtonOptions={{
        type: 'primary',
        children:
          t[
            isFreePlan
              ? 'com.affine.payment.member-limit.free.confirm'
              : 'com.affine.payment.member-limit.pro.confirm'
          ](),
      }}
      onConfirm={handleConfirm}
    ></ConfirmModal>
  );
};
