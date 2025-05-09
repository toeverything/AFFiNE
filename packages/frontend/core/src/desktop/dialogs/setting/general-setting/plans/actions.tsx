import { notify } from '@affine/component';
import { useDowngradeNotify } from '@affine/core/components/affine/subscription-landing/notify';
import { getDowngradeQuestionnaireLink } from '@affine/core/components/hooks/affine/use-subscription-notify';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';

import {
  AuthService,
  SubscriptionService,
  WorkspaceSubscriptionService,
} from '../../../../../modules/cloud';
import {
  ConfirmLoadingModal,
  DowngradeModal,
  DowngradeTeamModal,
} from './modals';

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
      await subscription.waitForRevalidation();
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

export const CancelTeamAction = ({
  children,
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & PropsWithChildren) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const [isMutating, setIsMutating] = useState(false);
  const subscription = useService(WorkspaceSubscriptionService).subscription;
  const workspaceSubscription = useLiveData(subscription.subscription$);
  const authService = useService(AuthService);
  const downgradeNotify = useDowngradeNotify();

  const downgrade = useAsyncCallback(async () => {
    try {
      const account = authService.session.account$.value;
      const prevRecurring = workspaceSubscription?.recurring;
      setIsMutating(true);
      await subscription.cancelSubscription(
        idempotencyKey,
        SubscriptionPlan.Team
      );
      await subscription.waitForRevalidation();
      // refresh idempotency key
      setIdempotencyKey(nanoid());
      onOpenChange(false);

      if (account && prevRecurring) {
        downgradeNotify(
          getDowngradeQuestionnaireLink({
            email: account.email ?? '',
            id: account.id,
            name: account.info?.name ?? '',
            plan: SubscriptionPlan.Team,
            recurring: prevRecurring,
          })
        );
      }
    } finally {
      setIsMutating(false);
    }
  }, [
    authService,
    workspaceSubscription?.recurring,
    subscription,
    idempotencyKey,
    onOpenChange,
    downgradeNotify,
  ]);

  if (workspaceSubscription?.canceledAt) {
    return null;
  }

  return (
    <>
      {children}
      <DowngradeTeamModal
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
      await subscription.waitForRevalidation();
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
export const TeamResumeAction = ({
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
  const subscription = useService(WorkspaceSubscriptionService).subscription;
  const t = useI18n();

  const resume = useAsyncCallback(async () => {
    try {
      setIsMutating(true);
      await subscription.resumeSubscription(
        idempotencyKey,
        SubscriptionPlan.Team
      );
      await subscription.waitForRevalidation();
      // refresh idempotency key
      setIdempotencyKey(nanoid());
      onOpenChange(false);
      notify.success({
        title: t['com.affine.payment.resume.success.title'](),
        message: t['com.affine.payment.resume.success.team.message'](),
      });
    } finally {
      setIsMutating(false);
    }
  }, [subscription, idempotencyKey, onOpenChange, t]);

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
