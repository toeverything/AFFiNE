import {
  Button,
  type ButtonProps,
  notify,
  useConfirmModal,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/hooks/use-mutation';
import { resumeSubscriptionMutation, SubscriptionPlan } from '@affine/graphql';
import { SingleSelectSelectSolidIcon } from '@blocksuite/icons';
import { cssVar } from '@toeverything/theme';
import { nanoid } from 'nanoid';
import { useState } from 'react';

import type { BaseActionProps } from '../types';

export interface AIResumeProps extends BaseActionProps, ButtonProps {}

export const AIResume = ({
  onSubscriptionUpdate,
  ...btnProps
}: AIResumeProps) => {
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
          { idempotencyKey, plan: SubscriptionPlan.AI },
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
  }, [openConfirmModal, trigger, idempotencyKey, onSubscriptionUpdate]);

  return (
    <Button loading={isMutating} onClick={resume} type="primary" {...btnProps}>
      Resume
    </Button>
  );
};
