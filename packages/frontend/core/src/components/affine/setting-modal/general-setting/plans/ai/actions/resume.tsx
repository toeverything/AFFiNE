import {
  Button,
  type ButtonProps,
  notify,
  useConfirmModal,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SingleSelectSelectSolidIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { nanoid } from 'nanoid';
import { useState } from 'react';

export interface AIResumeProps extends ButtonProps {}

export const AIResume = ({ ...btnProps }: AIResumeProps) => {
  const t = useAFFiNEI18N();
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const subscription = useService(SubscriptionService).subscription;

  const [isMutating, setIsMutating] = useState(false);

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
        setIsMutating(true);
        await subscription.resumeSubscription(
          idempotencyKey,
          SubscriptionPlan.AI
        );
        notify({
          icon: <SingleSelectSelectSolidIcon />,
          iconColor: cssVar('processingColor'),
          title:
            t['com.affine.payment.ai.action.resume.confirm.notify.title'](),
          message:
            t['com.affine.payment.ai.action.resume.confirm.notify.msg'](),
        });
        setIdempotencyKey(nanoid());
      },
    });
  }, [openConfirmModal, t, subscription, idempotencyKey]);

  return (
    <Button loading={isMutating} onClick={resume} type="primary" {...btnProps}>
      {t['com.affine.payment.ai.action.resume.button-label']()}
    </Button>
  );
};
