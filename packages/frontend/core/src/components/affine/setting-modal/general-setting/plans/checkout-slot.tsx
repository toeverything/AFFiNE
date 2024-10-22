import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { popupWindow } from '@affine/core/utils';
import type { CreateCheckoutSessionInput } from '@affine/graphql';
import { useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import {
  type PropsWithChildren,
  type ReactNode,
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

  const subscriptionService = useService(SubscriptionService);

  useEffect(() => {
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);
  useEffect(() => {
    if (isOpenedExternalWindow) {
      // when the external window is opened, revalidate the subscription when window get focus
      window.addEventListener(
        'focus',
        subscriptionService.subscription.revalidate
      );
      return () => {
        window.removeEventListener(
          'focus',
          subscriptionService.subscription.revalidate
        );
      };
    }
    return;
  }, [isOpenedExternalWindow, subscriptionService]);

  const subscribe = useAsyncCallback(async () => {
    setMutating(true);
    onBeforeCheckout?.();
    try {
      const session = await subscriptionService.createCheckoutSession({
        idempotencyKey,
        ...checkoutOptions,
      });
      popupWindow(session);
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
  ]);

  return <Renderer onClick={subscribe} loading={isMutating} />;
};
