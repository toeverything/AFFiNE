import {
  Button,
  type ButtonProps,
  notify,
  useConfirmModal,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { mixpanel } from '@affine/core/utils';
import { SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { SingleSelectSelectSolidIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { nanoid } from 'nanoid';
import { useState } from 'react';

export interface AIResumeProps extends ButtonProps {}

export const AIResume = ({ ...btnProps }: AIResumeProps) => {
  const t = useI18n();
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const subscription = useService(SubscriptionService).subscription;

  const [isMutating, setIsMutating] = useState(false);

  const { openConfirmModal } = useConfirmModal();

  const resume = useAsyncCallback(async () => {
    mixpanel.track('PlanChangeStarted', {
      segment: 'settings panel',
      control: 'plan resume action',
      type: subscription.ai$.value?.plan,
      category: subscription.ai$.value?.recurring,
    });

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
        mixpanel.track('ChangePlanSucceeded', {
          segment: 'settings panel',
          control: 'plan resume action',
        });
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
