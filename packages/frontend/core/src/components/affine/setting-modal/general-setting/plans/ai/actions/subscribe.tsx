import { Button, type ButtonProps } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { popupWindow } from '@affine/core/utils';
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AISubscribeProps extends ButtonProps {}

export const AISubscribe = ({ ...btnProps }: AISubscribeProps) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const [isMutating, setMutating] = useState(false);
  const newTabRef = useRef<Window | null>(null);

  const subscriptionService = useService(SubscriptionService);
  const price = useLiveData(subscriptionService.prices.aiPrice$);
  useEffect(() => {
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  const t = useAFFiNEI18N();

  const onClose = useCallback(() => {
    newTabRef.current = null;
    subscriptionService.subscription.revalidate();
  }, [subscriptionService]);

  useEffect(() => {
    return () => {
      if (newTabRef.current) {
        newTabRef.current.removeEventListener('close', onClose);
        newTabRef.current = null;
      }
    };
  }, [onClose]);

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
      const newTab = popupWindow(session);
      if (newTab) {
        newTabRef.current = newTab;
        newTab.addEventListener('close', onClose);
      }
      setIdempotencyKey(nanoid());
    } finally {
      setMutating(false);
    }
  }, [idempotencyKey, onClose, subscriptionService]);

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
