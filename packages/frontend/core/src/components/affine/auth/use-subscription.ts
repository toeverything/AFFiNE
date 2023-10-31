import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

enum SubscriptionKey {
  Recurring = 'subscription_recurring',
  Plan = 'subscription_plan',
}

export function useSubscriptionSearch() {
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    const withPayment =
      searchParams.has(SubscriptionKey.Recurring) &&
      searchParams.has(SubscriptionKey.Plan);

    if (!withPayment) {
      return null;
    }

    const recurring = searchParams.get(SubscriptionKey.Recurring);
    const plan = searchParams.get(SubscriptionKey.Plan);
    return {
      recurring,
      plan,
      get redirectUrl() {
        const paymentParams = new URLSearchParams([
          [SubscriptionKey.Recurring, recurring ?? ''],
          [SubscriptionKey.Plan, plan ?? ''],
        ]);
        return `/auth/subscription-redirect?${paymentParams.toString()}`;
      },
    };
  }, [searchParams]);
}
