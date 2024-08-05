import { ConfirmModal } from '@affine/component/ui/modal';
import { useI18n } from '@affine/i18n';
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
  const t = useI18n();
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
      confirmText={t[
        isFreePlan
          ? 'com.affine.payment.member-limit.free.confirm'
          : 'com.affine.payment.member-limit.pro.confirm'
      ]()}
      confirmButtonOptions={{
        variant: 'primary',
      }}
      onConfirm={handleConfirm}
    ></ConfirmModal>
  );
};
