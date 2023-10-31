import { SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ConfirmModal } from '@toeverything/components/modal';
import { useCallback } from 'react';

export interface MemberLimitModalProps {
  plan: SubscriptionPlan;
  open: boolean;
  setOpen: (value: boolean) => void;
  onConfirm: () => void;
}

export const MemberLimitModal = ({
  plan,
  open,
  setOpen,
  onConfirm,
}: MemberLimitModalProps) => {
  const t = useAFFiNEI18N();
  const isFreePlan = plan === SubscriptionPlan.Free;
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
      ]()}
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
