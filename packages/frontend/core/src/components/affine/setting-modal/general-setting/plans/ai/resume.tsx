import { Button, notify, useConfirmModal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/hooks/use-mutation';
import { resumeSubscriptionMutation } from '@affine/graphql';
import { SingleSelectSelectSolidIcon } from '@blocksuite/icons';
import { cssVar } from '@toeverything/theme';
import { nanoid } from 'nanoid';
import { useState } from 'react';

import { purchaseButton } from './ai-plan.css';
import type { BaseActionProps } from './types';

interface AIResumeProps extends BaseActionProps {}

export const AIResume = ({ plan, onSubscriptionUpdate }: AIResumeProps) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());

  const { isMutating, trigger } = useMutation({
    mutation: resumeSubscriptionMutation,
  });
  const { openConfirmModal } = useConfirmModal();

  const resume = useAsyncCallback(async () => {
    openConfirmModal({
      title: 'Resume Auto-Renewal?',
      description:
        'Are you sure you want to resume the subscription for AFFiNE AI? This means your payment method will be charged automatically at the end of each billing cycle, starting from the next billing cycle.',
      confirmButtonOptions: {
        children: 'Confirm',
        type: 'primary',
      },
      onConfirm: async () => {
        await trigger(
          { idempotencyKey, plan },
          {
            onSuccess: data => {
              // refresh idempotency key
              setIdempotencyKey(nanoid());
              onSubscriptionUpdate(data.resumeSubscription);
              notify({
                icon: (
                  <SingleSelectSelectSolidIcon
                    color={cssVar('processingColor')}
                  />
                ),
                title: 'Subscription Updated',
                message: 'You will be charged in the next billing cycle.',
              });
            },
          }
        );
      },
    });
  }, [openConfirmModal, trigger, idempotencyKey, plan, onSubscriptionUpdate]);

  return (
    <Button
      loading={isMutating}
      onClick={resume}
      className={purchaseButton}
      type="primary"
    >
      Resume
    </Button>
  );
};
