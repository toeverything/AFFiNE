import { Button, type ButtonProps, useConfirmModal } from '@affine/component';
import { useDowngradeNotify } from '@affine/core/components/affine/subscription-landing/notify';
import { getDowngradeQuestionnaireLink } from '@affine/core/components/hooks/affine/use-subscription-notify';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService, SubscriptionService } from '@affine/core/modules/cloud';
import { SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useState } from 'react';

export const AICancel = (btnProps: ButtonProps) => {
  const t = useI18n();
  const [isMutating, setMutating] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const subscription = useService(SubscriptionService).subscription;
  const authService = useService(AuthService);

  const { openConfirmModal } = useConfirmModal();
  const downgradeNotify = useDowngradeNotify();

  const cancel = useAsyncCallback(async () => {
    const aiSubscription = subscription.ai$.value;
    if (aiSubscription) {
      track.$.settingsPanel.plans.cancelSubscription({
        plan: SubscriptionPlan.AI,
        recurring: aiSubscription.recurring,
      });
    }
    openConfirmModal({
      title: t['com.affine.payment.ai.action.cancel.confirm.title'](),
      description:
        t['com.affine.payment.ai.action.cancel.confirm.description'](),
      reverseFooter: true,
      confirmText:
        t['com.affine.payment.ai.action.cancel.confirm.confirm-text'](),
      confirmButtonOptions: {
        variant: 'secondary',
      },
      cancelText:
        t['com.affine.payment.ai.action.cancel.confirm.cancel-text'](),
      cancelButtonOptions: {
        variant: 'primary',
      },
      onConfirm: async () => {
        try {
          setMutating(true);
          await subscription.cancelSubscription(
            idempotencyKey,
            SubscriptionPlan.AI
          );
          setIdempotencyKey(nanoid());
          track.$.settingsPanel.plans.confirmCancelingSubscription({
            plan: SubscriptionPlan.AI,
            recurring: aiSubscription?.recurring,
          });
          const account = authService.session.account$.value;
          const prevRecurring = subscription.ai$.value?.recurring;
          if (account && prevRecurring) {
            downgradeNotify(
              getDowngradeQuestionnaireLink({
                email: account.email,
                name: account.info?.name,
                id: account.id,
                plan: SubscriptionPlan.AI,
                recurring: prevRecurring,
              })
            );
          }
        } finally {
          setMutating(false);
        }
      },
    });
  }, [
    subscription,
    openConfirmModal,
    t,
    idempotencyKey,
    authService.session.account$.value,
    downgradeNotify,
  ]);

  return (
    <Button
      onClick={cancel}
      loading={isMutating}
      variant="primary"
      {...btnProps}
    >
      {t['com.affine.payment.ai.action.cancel.button-label']()}
    </Button>
  );
};
