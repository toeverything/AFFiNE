import { Button, useConfirmModal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/hooks/use-mutation';
import { cancelSubscriptionMutation } from '@affine/graphql';
import { nanoid } from 'nanoid';
import { useState } from 'react';

import { purchaseButton } from './ai-plan.css';
import type { BaseActionProps } from './types';

interface AICancelProps extends BaseActionProps {}
export const AICancel = ({ plan, onSubscriptionUpdate }: AICancelProps) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const { trigger, isMutating } = useMutation({
    mutation: cancelSubscriptionMutation,
  });
  const { openConfirmModal } = useConfirmModal();

  const cancel = useAsyncCallback(async () => {
    openConfirmModal({
      title: 'Cancel Subscription',
      description:
        'If you end your subscription now, you can still use AFFiNE AI until the end of this billing period.',
      reverseFooter: true,
      confirmButtonOptions: {
        children: 'Cancel Subscription',
        type: 'default',
      },
      cancelText: 'Keep AFFiNE AI',
      cancelButtonOptions: {
        type: 'primary',
      },
      onConfirm: async () => {
        await trigger(
          { idempotencyKey, plan },
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
  }, [openConfirmModal, trigger, idempotencyKey, plan, onSubscriptionUpdate]);

  return (
    <Button
      onClick={cancel}
      loading={isMutating}
      className={purchaseButton}
      type="primary"
    >
      Cancel subscription
    </Button>
  );
};
