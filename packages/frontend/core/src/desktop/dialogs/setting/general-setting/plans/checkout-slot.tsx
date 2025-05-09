import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  SubscriptionService,
  UserQuotaService,
} from '@affine/core/modules/cloud';
import { UrlService } from '@affine/core/modules/url';
import type { CreateCheckoutSessionInput } from '@affine/graphql';
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
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const [isMutating, setMutating] = useState(false);
  const [isOpenedExternalWindow, setOpenedExternalWindow] = useState(false);
  const urlService = useService(UrlService);

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

  const subscribe = useAsyncCallback(async () => {
    setMutating(true);
    onBeforeCheckout?.();
    try {
      const session = await subscriptionService.createCheckoutSession({
        idempotencyKey,
        ...checkoutOptions,
      });
      urlService.openExternal(session);
      setOpenedExternalWindow(true);
      setIdempotencyKey(nanoid());
      onCheckoutSuccess?.();
    } catch (e) {
      onCheckoutError?.(e);
    } finally {
      setMutating(false);
    }
  }, [
    checkoutOptions,
    idempotencyKey,
    onBeforeCheckout,
    onCheckoutError,
    onCheckoutSuccess,
    subscriptionService,
    urlService,
  ]);

  return <Renderer onClick={subscribe} loading={isMutating} />;
};
