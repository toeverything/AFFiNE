import { Button, type ButtonProps, useConfirmModal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/hooks/use-mutation';
import { cancelSubscriptionMutation, SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { nanoid } from 'nanoid';
import { useState } from 'react';

import type { BaseActionProps } from '../types';

export interface AICancelProps extends BaseActionProps, ButtonProps {}
export const AICancel = ({
  onSubscriptionUpdate,
  ...btnProps
}: AICancelProps) => {
  const t = useAFFiNEI18N();
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const { trigger, isMutating } = useMutation({
    mutation: cancelSubscriptionMutation,
  });
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
        await trigger(
          { idempotencyKey, plan: SubscriptionPlan.AI },
          {
            onSuccess: data => {
              // refresh idempotency key
              setIdempotencyKey(nanoid());
              onSubscriptionUpdate(data.cancelSubscription);
            },
          }
        );
      },
    });
  }, [openConfirmModal, t, trigger, idempotencyKey, onSubscriptionUpdate]);

  return (
    <Button onClick={cancel} loading={isMutating} type="primary" {...btnProps}>
      {t['com.affine.payment.ai.action.cancel.button-label']()}
    </Button>
  );
};
