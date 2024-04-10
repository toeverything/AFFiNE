import { useCurrentLoginStatus } from '@affine/core/hooks/affine/use-current-login-status';
import { useUserSubscription } from '@affine/core/hooks/use-subscription';
import { timestampToLocalDate } from '@affine/core/utils';
import { SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import { AICancel, AILogin, AIResume, AISubscribe } from './actions';

const plan = SubscriptionPlan.AI;

export type ActionType = 'login' | 'subscribe' | 'resume' | 'cancel';

export const useAffineAISubscription = () => {
  const t = useAFFiNEI18N();
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
    ? t['com.affine.payment.ai.billing-tip.next-bill-at']({
        due: timestampToLocalDate(subscription.nextBillAt),
      })
    : subscription?.canceledAt && subscription.end
      ? t['com.affine.payment.ai.billing-tip.end-at']({
          end: timestampToLocalDate(subscription.end),
        })
      : null;

  return { actionType, Action, billingTip };
};
