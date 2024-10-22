import { Button, type ButtonProps, Skeleton } from '@affine/component';
import { generateSubscriptionCallbackLink } from '@affine/core/components/hooks/affine/use-subscription-notify';
import { AuthService, SubscriptionService } from '@affine/core/modules/cloud';
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { CheckoutSlot } from '../../checkout-slot';

export interface AISubscribeProps extends ButtonProps {
  displayedFrequency?: 'yearly' | 'monthly' | null;
}

export const AISubscribe = ({
  displayedFrequency = 'yearly',
  ...btnProps
}: AISubscribeProps) => {
  const authService = useService(AuthService);

  const subscriptionService = useService(SubscriptionService);
  const price = useLiveData(subscriptionService.prices.aiPrice$);

  const t = useI18n();

  const onBeforeCheckout = useCallback(() => {
    track.$.settingsPanel.plans.checkout({
      plan: SubscriptionPlan.AI,
      recurring: SubscriptionRecurring.Yearly,
    });
  }, []);
  const checkoutOptions = useMemo(
    () => ({
      recurring: SubscriptionRecurring.Yearly,
      plan: SubscriptionPlan.AI,
      variant: null,
      coupon: null,
      successCallbackLink: generateSubscriptionCallbackLink(
        authService.session.account$.value,
        SubscriptionPlan.AI,
        SubscriptionRecurring.Yearly
      ),
    }),
    [authService.session.account$.value]
  );

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
    <CheckoutSlot
      onBeforeCheckout={onBeforeCheckout}
      checkoutOptions={checkoutOptions}
      renderer={props => (
        <Button variant="primary" {...props} {...btnProps}>
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
      )}
    />
  );
};
