import { Button, type ButtonProps, Skeleton } from '@affine/component';
import { generateSubscriptionCallbackLink } from '@affine/core/components/hooks/affine/use-subscription-notify';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService, SubscriptionService } from '@affine/core/modules/cloud';
import { popupWindow } from '@affine/core/utils';
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';

export interface AISubscribeProps extends ButtonProps {
  displayedFrequency?: 'yearly' | 'monthly';
}

export const AISubscribe = ({
  displayedFrequency = 'yearly',
  ...btnProps
}: AISubscribeProps) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const [isMutating, setMutating] = useState(false);
  const [isOpenedExternalWindow, setOpenedExternalWindow] = useState(false);
  const authService = useService(AuthService);

  const subscriptionService = useService(SubscriptionService);
  const price = useLiveData(subscriptionService.prices.aiPrice$);
  useEffect(() => {
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  const t = useI18n();

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
    track.$.settingsPanel.plans.checkout({
      plan: SubscriptionPlan.AI,
      recurring: SubscriptionRecurring.Yearly,
    });
    try {
      const session = await subscriptionService.createCheckoutSession({
        recurring: SubscriptionRecurring.Yearly,
        idempotencyKey,
        plan: SubscriptionPlan.AI,
        variant: null,
        coupon: null,
        successCallbackLink: generateSubscriptionCallbackLink(
          authService.session.account$.value,
          SubscriptionPlan.AI,
          SubscriptionRecurring.Yearly
        ),
      });
      popupWindow(session);
      setOpenedExternalWindow(true);
      setIdempotencyKey(nanoid());
    } finally {
      setMutating(false);
    }
  }, [authService, idempotencyKey, subscriptionService]);

  if (!price || !price.yearlyAmount) {
    return (
      <Skeleton
        className={btnProps.className}
        width={160}
        height={36}
        style={{
          borderRadius: 18,
          ...btnProps.style,
        }}
      />
    );
  }

  const priceReadable = `$${(
    price.yearlyAmount /
    100 /
    (displayedFrequency === 'yearly' ? 1 : 12)
  ).toFixed(2)}`;
  const priceFrequency =
    displayedFrequency === 'yearly'
      ? t['com.affine.payment.billing-setting.year']()
      : t['com.affine.payment.billing-setting.month']();

  return (
    <Button
      loading={isMutating}
      onClick={subscribe}
      variant="primary"
      {...btnProps}
    >
      {btnProps.children ?? `${priceReadable} / ${priceFrequency}`}
      {displayedFrequency === 'monthly' ? (
        <span
          style={{
            fontSize: 10,
            opacity: 0.75,
            letterSpacing: -0.2,
            paddingLeft: 4,
          }}
        >
          {t['com.affine.payment.ai.subscribe.billed-annually']()}
        </span>
      ) : null}
    </Button>
  );
};
