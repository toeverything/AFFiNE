import { getDowngradeQuestionnaireLink } from '@affine/core/components/hooks/affine/use-subscription-notify';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { SubscriptionPlan } from '@affine/graphql';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';

import { AuthService, SubscriptionService } from '../../../../../modules/cloud';
import { useDowngradeNotify } from '../../../subscription-landing/notify';
import { ConfirmLoadingModal, DowngradeModal } from './modals';

/**
 * Cancel action with modal & request
 * @param param0
 * @returns
 */
export const CancelAction = ({
  children,
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & PropsWithChildren) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const [isMutating, setIsMutating] = useState(false);
  const subscription = useService(SubscriptionService).subscription;
  const proSubscription = useLiveData(subscription.pro$);
  const authService = useService(AuthService);
  const downgradeNotify = useDowngradeNotify();

  useEffect(() => {
    if (!open || !proSubscription) return;
    track.$.settingsPanel.plans.cancelSubscription({
      plan: proSubscription.plan,
      recurring: proSubscription.recurring,
    });
  }, [open, proSubscription]);

  const downgrade = useAsyncCallback(async () => {
    try {
      const account = authService.session.account$.value;
      const prevRecurring = subscription.pro$.value?.recurring;
      setIsMutating(true);
      await subscription.cancelSubscription(idempotencyKey);
      subscription.revalidate();
      await subscription.isRevalidating$.waitFor(v => !v);
      // refresh idempotency key
      setIdempotencyKey(nanoid());
      onOpenChange(false);
      const proSubscription = subscription.pro$.value;
      if (proSubscription) {
        track.$.settingsPanel.plans.confirmCancelingSubscription({
          plan: proSubscription.plan,
          recurring: proSubscription.recurring,
        });
      }
      if (account && prevRecurring) {
        downgradeNotify(
          getDowngradeQuestionnaireLink({
            email: account.email ?? '',
            id: account.id,
            name: account.info?.name ?? '',
            plan: SubscriptionPlan.Pro,
            recurring: prevRecurring,
          })
        );
      }
    } finally {
      setIsMutating(false);
    }
  }, [
    authService.session.account$.value,
    subscription,
    idempotencyKey,
    onOpenChange,
    downgradeNotify,
  ]);

  return (
    <>
      {children}
      <DowngradeModal
        open={open}
        onCancel={downgrade}
        onOpenChange={onOpenChange}
        loading={isMutating}
      />
    </>
  );
};

/**
 * Resume payment action with modal & request
 * @param param0
 * @returns
 */
export const ResumeAction = ({
  children,
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & PropsWithChildren) => {
  // allow replay request on network error until component unmount or success
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const [isMutating, setIsMutating] = useState(false);
  const subscription = useService(SubscriptionService).subscription;

  const resume = useAsyncCallback(async () => {
    try {
      setIsMutating(true);
      await subscription.resumeSubscription(idempotencyKey);
      subscription.revalidate();
      await subscription.isRevalidating$.waitFor(v => !v);
      // refresh idempotency key
      setIdempotencyKey(nanoid());
      onOpenChange(false);
      const proSubscription = subscription.pro$.value;
      if (proSubscription) {
        track.$.settingsPanel.plans.confirmResumingSubscription({
          plan: proSubscription.plan,
          recurring: proSubscription.recurring,
        });
      }
    } finally {
      setIsMutating(false);
    }
  }, [subscription, idempotencyKey, onOpenChange]);

  return (
    <>
      {children}
      <ConfirmLoadingModal
        type={'resume'}
        open={open}
        onConfirm={resume}
        onOpenChange={onOpenChange}
        loading={isMutating}
      />
    </>
  );
};
