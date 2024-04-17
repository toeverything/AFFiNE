import { Button, type ButtonProps } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { popupWindow } from '@affine/core/utils';
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';

export interface AISubscribeProps extends ButtonProps {}

export const AISubscribe = ({ ...btnProps }: AISubscribeProps) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const [isMutating, setMutating] = useState(false);
  const [isOpenedExternalWindow, setOpenedExternalWindow] = useState(false);

  const subscriptionService = useService(SubscriptionService);
  const price = useLiveData(subscriptionService.prices.aiPrice$);
  useEffect(() => {
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  const t = useAFFiNEI18N();

  useEffect(() => {
    if (isOpenedExternalWindow) {
      // when the external window is opened, revalidate the subscription status every 3 seconds
      const timer = setInterval(() => {
        subscriptionService.subscription.revalidate();
      }, 3000);
      return () => clearInterval(timer);
    }
    return;
  }, [isOpenedExternalWindow, subscriptionService]);

  const subscribe = useAsyncCallback(async () => {
    setMutating(true);
    try {
      const session = await subscriptionService.createCheckoutSession({
        recurring: SubscriptionRecurring.Yearly,
        idempotencyKey,
        plan: SubscriptionPlan.AI,
        coupon: null,
        successCallbackLink: null,
      });
      popupWindow(session);
      setOpenedExternalWindow(true);
      setIdempotencyKey(nanoid());
    } finally {
      setMutating(false);
    }
  }, [idempotencyKey, subscriptionService]);

  if (!price || !price.yearlyAmount) {
    // TODO: loading UI
    return null;
  }

  const priceReadable = `$${(price.yearlyAmount / 100).toFixed(2)}`;
  const priceFrequency = t['com.affine.payment.billing-setting.year']();

  return (
    <Button
      loading={isMutating}
      onClick={subscribe}
      type="primary"
      {...btnProps}
    >
      {btnProps.children ?? `${priceReadable} / ${priceFrequency}`}
    </Button>
  );
};
