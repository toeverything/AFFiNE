import {
  Button,
  type ButtonProps,
  notify,
  useConfirmModal,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/hooks/use-mutation';
import { resumeSubscriptionMutation, SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
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
  const t = useAFFiNEI18N();
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());

  const { isMutating, trigger } = useMutation({
    mutation: resumeSubscriptionMutation,
  });
  const { openConfirmModal } = useConfirmModal();

  const resume = useAsyncCallback(async () => {
    openConfirmModal({
      title: t['com.affine.payment.ai.action.resume.confirm.title'](),
      description:
        t['com.affine.payment.ai.action.resume.confirm.description'](),
      confirmButtonOptions: {
        children:
          t['com.affine.payment.ai.action.resume.confirm.confirm-text'](),
        type: 'primary',
      },
      cancelText:
        t['com.affine.payment.ai.action.resume.confirm.cancel-text'](),
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
                title:
                  t[
                    'com.affine.payment.ai.action.resume.confirm.notify.title'
                  ](),
                message:
                  t['com.affine.payment.ai.action.resume.confirm.notify.msg'](),
              });
            },
          }
        );
      },
    });
  }, [openConfirmModal, t, trigger, idempotencyKey, onSubscriptionUpdate]);

  return (
    <Button loading={isMutating} onClick={resume} type="primary" {...btnProps}>
      {t['com.affine.payment.ai.action.resume.button-label']()}
    </Button>
  );
};
