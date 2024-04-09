import { useCurrentLoginStatus } from '@affine/core/hooks/affine/use-current-login-status';
import { useUserSubscription } from '@affine/core/hooks/use-subscription';
import { timestampToLocalDate } from '@affine/core/utils';
import { SubscriptionPlan } from '@affine/graphql';

import { AICancel, AILogin, AIResume, AISubscribe } from './actions';

const plan = SubscriptionPlan.AI;

export type ActionType = 'login' | 'subscribe' | 'resume' | 'cancel';

export const useAffineAISubscription = () => {
  const loggedIn = useCurrentLoginStatus() === 'authenticated';

  const [subscription] = useUserSubscription(plan);

  const isCancelled = !!subscription?.canceledAt;
  const actionType: ActionType = !loggedIn
    ? 'login'
    : !subscription
      ? 'subscribe'
      : isCancelled
        ? 'resume'
        : 'cancel';

  const Action = {
    login: AILogin,
    subscribe: AISubscribe,
    resume: AIResume,
    cancel: AICancel,
  }[actionType];

  const billingTip = subscription?.nextBillAt
    ? `You have purchased AFFiNE AI. The next payment date is ${timestampToLocalDate(subscription.nextBillAt)}.`
    : subscription?.canceledAt && subscription.end
      ? `You have purchased AFFiNE AI. The expiration date is ${timestampToLocalDate(subscription.end)}.`
      : null;

  return { actionType, Action, billingTip };
};
