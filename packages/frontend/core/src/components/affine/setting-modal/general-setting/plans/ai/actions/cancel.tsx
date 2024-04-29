import { Button, type ButtonProps, useConfirmModal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useState } from 'react';

export interface AICancelProps extends ButtonProps {}
export const AICancel = ({ ...btnProps }: AICancelProps) => {
  const t = useAFFiNEI18N();
  const [isMutating, setMutating] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const subscription = useService(SubscriptionService).subscription;

  const { openConfirmModal } = useConfirmModal();

  const cancel = useAsyncCallback(async () => {
    openConfirmModal({
      title: t['com.affine.payment.ai.action.cancel.confirm.title'](),
      description:
        t['com.affine.payment.ai.action.cancel.confirm.description'](),
      reverseFooter: true,
      confirmButtonOptions: {
        children:
          t['com.affine.payment.ai.action.cancel.confirm.confirm-text'](),
        type: 'default',
      },
      cancelText:
        t['com.affine.payment.ai.action.cancel.confirm.cancel-text'](),
      cancelButtonOptions: {
        type: 'primary',
      },
      onConfirm: async () => {
        try {
          setMutating(true);
          await subscription.cancelSubscription(
            idempotencyKey,
            SubscriptionPlan.AI
          );
          setIdempotencyKey(nanoid());
        } finally {
          setMutating(false);
        }
      },
    });
  }, [openConfirmModal, t, subscription, idempotencyKey]);

  return (
    <Button onClick={cancel} loading={isMutating} type="primary" {...btnProps}>
      {t['com.affine.payment.ai.action.cancel.button-label']()}
    </Button>
  );
};
