import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

enum SubscriptionKey {
  Recurring = 'subscription_recurring',
  Plan = 'subscription_plan',
  SignUp = 'sign_up', // A new user with subscription journey: signup > set password > pay in stripe > go to app
  Token = 'token', // When signup, there should have a token to set password
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
    const withSignUp = searchParams.get(SubscriptionKey.SignUp) === '1';
    const passwordToken = searchParams.get(SubscriptionKey.Token);
    return {
      recurring,
      plan,
      withSignUp,
      passwordToken,
      getRedirectUrl(signUp?: boolean) {
        const paymentParams = new URLSearchParams([
          [SubscriptionKey.Recurring, recurring ?? ''],
          [SubscriptionKey.Plan, plan ?? ''],
        ]);

        if (signUp) {
          paymentParams.set(SubscriptionKey.SignUp, '1');
        }

        return `/auth/subscription-redirect?${paymentParams.toString()}`;
      },
    };
  }, [searchParams]);
}
