import { Button, Loading } from '@affine/component';
import { UrlService } from '@affine/core/modules/url';
import { UserFriendlyError } from '@affine/error';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionVariant,
} from '@affine/graphql';
import { track } from '@affine/track';
import { effect, fromPromise, useServices } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { switchMap } from 'rxjs';

import { generateSubscriptionCallbackLink } from '../../../components/hooks/affine/use-subscription-notify';
import {
  RouteLogic,
  useNavigateHelper,
} from '../../../components/hooks/use-navigate-helper';
import { AuthService, SubscriptionService } from '../../../modules/cloud';
import { container } from './subscribe.css';

interface ProductTriple {
  plan: SubscriptionPlan;
  recurring: SubscriptionRecurring;
  variant: SubscriptionVariant | null;
}

const products = {
  ai: 'ai_yearly',
  pro: 'pro_yearly',
  'monthly-pro': 'pro_monthly',
  believer: 'pro_lifetime',
  team: 'team_yearly',
  'monthly-team': 'team_monthly',
  'yearly-selfhost-team': 'selfhost-team_yearly',
  'monthly-selfhost-team': 'selfhost-team_monthly',
  'oneyear-ai': 'ai_yearly_onetime',
  'oneyear-pro': 'pro_yearly_onetime',
  'onemonth-pro': 'pro_monthly_onetime',
};

const allowedPlan = {
  ai: SubscriptionPlan.AI,
  pro: SubscriptionPlan.Pro,
  team: SubscriptionPlan.Team,
  'selfhost-team': SubscriptionPlan.SelfHostedTeam,
};
const allowedRecurring = {
  monthly: SubscriptionRecurring.Monthly,
  yearly: SubscriptionRecurring.Yearly,
  lifetime: SubscriptionRecurring.Lifetime,
};

const allowedVariant = {
  earlyaccess: SubscriptionVariant.EA,
  onetime: SubscriptionVariant.Onetime,
};

function getProductTriple(searchParams: URLSearchParams): ProductTriple {
  const triple: ProductTriple = {
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
    variant: null,
  };

  const productName = searchParams.get('product') as
    | keyof typeof products
    | null;
  let plan = searchParams.get('plan') as keyof typeof allowedPlan | null;
  let recurring = searchParams.get('recurring') as
    | keyof typeof allowedRecurring
    | null;
  let variant = searchParams.get('variant') as
    | keyof typeof allowedVariant
    | null;

  if (productName && products[productName]) {
    // @ts-expect-error safe
    [plan, recurring, variant] = products[productName].split('_');
  }

  if (plan) {
    triple.plan = allowedPlan[plan];
  }

  if (recurring) {
    triple.recurring = allowedRecurring[recurring];
  }
  if (variant) {
    triple.variant = allowedVariant[variant];
  }

  return triple;
}

export const Component = () => {
  const { authService, subscriptionService, urlService } = useServices({
    AuthService,
    SubscriptionService,
    UrlService,
  });
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const { jumpToSignIn, jumpToIndex } = useNavigateHelper();
  const idempotencyKey = useMemo(() => nanoid(), []);

  const { plan, recurring, variant } = getProductTriple(searchParams);
  const coupon = searchParams.get('coupon');

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
          setMessage('Checkout...');

          try {
            const account = authService.session.account$.value;
            // should never reach
            if (!account) throw new Error('No account');

            track.subscriptionLanding.$.$.checkout({
              control: 'pricing',
              plan,
              recurring,
            });

            const checkout = await subscriptionService.createCheckoutSession({
              idempotencyKey,
              plan,
              recurring,
              variant,
              coupon,
              successCallbackLink: generateSubscriptionCallbackLink(
                account,
                plan,
                recurring
              ),
            });
            setMessage('Redirecting...');
            urlService.openExternal(checkout);
          } catch (err) {
            const e = UserFriendlyError.fromAny(err);
            setMessage(e.message);
          }
        });
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
    variant,
    coupon,
    urlService,
  ]);

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
          <Button variant="primary" onClick={() => setRetryKey(i => i + 1)}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
};
