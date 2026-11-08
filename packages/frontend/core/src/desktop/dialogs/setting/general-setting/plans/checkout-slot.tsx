import { notify, useConfirmModal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  SubscriptionService,
  UserQuotaService,
} from '@affine/core/modules/cloud';
import { UrlService } from '@affine/core/modules/url';
import { UserFriendlyError } from '@affine/error';
import {
  type CreateCheckoutSessionInput,
  SubscriptionPlan,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import {
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';

export interface CheckoutSlotProps extends PropsWithChildren {
  checkoutOptions: Omit<CreateCheckoutSessionInput, 'idempotencyKey'>;
  onBeforeCheckout?: () => void;
  onCheckoutError?: (error: any) => void;
  onCheckoutSuccess?: () => void;
  renderer: (props: { onClick: () => void; loading: boolean }) => ReactNode;
}

/**
 * A wrapper component for checkout action
 */
export const CheckoutSlot = ({
  checkoutOptions,
  onBeforeCheckout,
  onCheckoutError,
  onCheckoutSuccess,
  renderer: Renderer,
}: CheckoutSlotProps) => {
  const t = useI18n();
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const [isMutating, setMutating] = useState(false);
  const [isOpenedExternalWindow, setOpenedExternalWindow] = useState(false);
  const urlService = useService(UrlService);
  const { openConfirmModal } = useConfirmModal();

  const subscriptionService = useService(SubscriptionService);
  const userQuotaService = useService(UserQuotaService);

  const revalidate = useCallback(() => {
    subscriptionService.subscription.revalidate();
    userQuotaService.quota.revalidate();
  }, [subscriptionService, userQuotaService]);

  useEffect(() => {
    if (isOpenedExternalWindow) {
      // when the external window is opened, revalidate the subscription when window get focus
      window.addEventListener('focus', revalidate);
      return () => {
        window.removeEventListener('focus', revalidate);
      };
    }
    return;
  }, [isOpenedExternalWindow, revalidate, subscriptionService]);

  const openCheckout = useCallback(
    async (key: string) => {
      const session = await subscriptionService.createCheckoutSession({
        ...checkoutOptions,
        idempotencyKey: key,
      });
      urlService.openExternal(session);
      setOpenedExternalWindow(true);
      setIdempotencyKey(nanoid());
      onCheckoutSuccess?.();
    },
    [checkoutOptions, onCheckoutSuccess, subscriptionService, urlService]
  );

  const subscribe = useAsyncCallback(async () => {
    setMutating(true);
    onBeforeCheckout?.();
    const reportError = (error: unknown) => {
      if (onCheckoutError) {
        onCheckoutError(error);
      } else {
        notify.error(UserFriendlyError.fromAny(error));
      }
    };
    try {
      await openCheckout(idempotencyKey);
    } catch (error) {
      const plan = checkoutOptions.plan ?? SubscriptionPlan.Pro;
      if (
        UserFriendlyError.fromAny(error).name === 'PURCHASE_IN_PROGRESS' &&
        (plan === SubscriptionPlan.Pro || plan === SubscriptionPlan.AI)
      ) {
        try {
          const attemptId = await subscriptionService.checkoutAttempt(plan);
          if (attemptId) {
            openConfirmModal({
              title: t['com.affine.payment.modal.end-checkout.title'](),
              description:
                t['com.affine.payment.modal.end-checkout.description'](),
              confirmText: t['com.affine.payment.modal.end-checkout.confirm'](),
              onConfirm: async () => {
                try {
                  if (
                    await subscriptionService.expireCheckout(plan, attemptId)
                  ) {
                    const key = nanoid();
                    setIdempotencyKey(key);
                    await openCheckout(key);
                  } else {
                    reportError(error);
                  }
                } catch (expireError) {
                  reportError(expireError);
                }
              },
            });
            return;
          }
        } catch (lookupError) {
          reportError(lookupError);
          return;
        }
      }
      reportError(error);
    } finally {
      setMutating(false);
    }
  }, [
    checkoutOptions.plan,
    idempotencyKey,
    onBeforeCheckout,
    onCheckoutError,
    openCheckout,
    openConfirmModal,
    subscriptionService,
    t,
  ]);

  return <Renderer onClick={subscribe} loading={isMutating} />;
};
