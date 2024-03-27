import { useCurrentLoginStatus } from '@affine/core/hooks/affine/use-current-login-status';
import {
  type SubscriptionMutator,
  useUserSubscription,
} from '@affine/core/hooks/use-subscription';
import {
  type PricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
} from '@affine/graphql';

import { AICancel } from './cancel';
import { AILogin } from './login';
import { AIResume } from './resume';
import { AISubscribe } from './subscribe';
import type { BaseActionProps } from './types';

interface AIPlanProps {
  price?: PricesQuery['prices'][number];
  onSubscriptionUpdate: SubscriptionMutator;
}
export const AIPlanCard = ({ price, onSubscriptionUpdate }: AIPlanProps) => {
  const plan = SubscriptionPlan.AI;
  const recurring = SubscriptionRecurring.Yearly;

  const loggedIn = useCurrentLoginStatus() === 'authenticated';

  const [subscription] = useUserSubscription(plan);

  // yearly subscription should always be available
  if (!price?.yearlyAmount) return null;

  const baseActionProps: BaseActionProps = {
    plan,
    price,
    recurring,
    onSubscriptionUpdate,
  };
  // const isCancelled = subscription.status === SubscriptionStatus.Canceled;
  const isCancelled = !!subscription?.canceledAt;

  const Action = !loggedIn
    ? AILogin
    : !subscription
      ? AISubscribe
      : isCancelled
        ? AIResume
        : AICancel;

  return (
    <div>
      AI Subscription:
      <br />
      <Action {...baseActionProps} />
    </div>
  );
};
