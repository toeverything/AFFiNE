import { Button, Loading } from '@affine/component';
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { effect, fromPromise, useServices } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EMPTY, mergeMap, switchMap } from 'rxjs';

import { generateSubscriptionCallbackLink } from '../hooks/affine/use-subscription-notify';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';
import { AuthService, SubscriptionService } from '../modules/cloud';
import { mixpanel } from '../utils';
import { container } from './subscribe.css';

export const Component = () => {
  const { authService, subscriptionService } = useServices({
    AuthService,
    SubscriptionService,
  });
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const { jumpToSignIn, jumpToIndex } = useNavigateHelper();
  const idempotencyKey = useMemo(() => nanoid(), []);

  const plan = searchParams.get('plan') as string | null;
  const recurring = searchParams.get('recurring') as string | null;

  useEffect(() => {
    const call = effect(
      switchMap(() => {
        return fromPromise(async signal => {
          retryKey;
          // TODO(@eyhn): i18n
          setMessage('Checking account status...');
          setError('');
          await authService.session.waitForRevalidation(signal);
          const loggedIn =
            authService.session.status$.value === 'authenticated';
          if (!loggedIn) {
            setMessage('Redirecting to sign in...');
            jumpToSignIn(
              location.pathname + location.search,
              RouteLogic.REPLACE
            );
            return;
          }
          setMessage('Checking subscription status...');
          await subscriptionService.subscription.waitForRevalidation(signal);
          const subscribed =
            plan?.toLowerCase() === 'ai'
              ? !!subscriptionService.subscription.ai$.value
              : !!subscriptionService.subscription.pro$.value;
          if (!subscribed) {
            setMessage('Creating checkout...');
            mixpanel.track('PlanUpgradeStarted', {
              type: plan,
              category: recurring,
            });
            try {
              const account = authService.session.account$.value;
              // should never reach
              if (!account) throw new Error('No account');
              const targetPlan =
                plan?.toLowerCase() === 'ai'
                  ? SubscriptionPlan.AI
                  : SubscriptionPlan.Pro;
              const targetRecurring =
                recurring?.toLowerCase() === 'monthly'
                  ? SubscriptionRecurring.Monthly
                  : SubscriptionRecurring.Yearly;
              const checkout = await subscriptionService.createCheckoutSession({
                idempotencyKey,
                plan: targetPlan,
                coupon: null,
                recurring: targetRecurring,
                successCallbackLink: generateSubscriptionCallbackLink(
                  account,
                  targetPlan,
                  targetRecurring
                ),
              });
              setMessage('Redirecting...');
              location.href = checkout;
              mixpanel.track('PlanChangeSucceeded', {
                type: plan,
                category: recurring,
              });
              if (plan) {
                mixpanel.people.set({
                  [SubscriptionPlan.AI === plan ? 'ai plan' : plan]: plan,
                  recurring: recurring,
                });
              }
            } catch (err) {
              console.error(err);
              setError('Something went wrong. Please try again.');
            }
          } else {
            setMessage('Your account is already subscribed. Redirecting...');
            await new Promise(resolve => {
              setTimeout(resolve, 5000);
            });
            jumpToIndex(RouteLogic.REPLACE);
          }
        }).pipe(mergeMap(() => EMPTY));
      })
    );

    call();

    return () => {
      call.unsubscribe();
    };
  }, [
    authService,
    subscriptionService,
    jumpToSignIn,
    idempotencyKey,
    plan,
    jumpToIndex,
    recurring,
    retryKey,
  ]);

  useEffect(() => {
    authService.session.revalidate();
  }, [authService]);

  return (
    <div className={container}>
      {!error ? (
        <>
          {message}
          <br />
          <Loading size={20} />
        </>
      ) : (
        <>
          {error}
          <br />
          <Button type="primary" onClick={() => setRetryKey(i => i + 1)}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
};
