import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import type { SubscriptionQuery } from '@affine/graphql';
import { subscriptionQuery } from '@affine/graphql';

import { useServerFeatures } from './affine/use-server-config';
import { useQuery } from './use-query';

export type Subscription = NonNullable<
  NonNullable<SubscriptionQuery['currentUser']>['subscription']
>;

export type SubscriptionMutator = (update?: Partial<Subscription>) => void;

const selector = (data: SubscriptionQuery) =>
  data.currentUser?.subscription ?? null;

export const useUserSubscription = () => {
  const { payment: hasPaymentFeature } = useServerFeatures();
  const { data, mutate } = useQuery(
    hasPaymentFeature ? { query: subscriptionQuery } : undefined
  );

  const set: SubscriptionMutator = useAsyncCallback(
    async (update?: Partial<Subscription>) => {
      await mutate(prev => {
        if (!update || !prev?.currentUser?.subscription) {
          return;
        }

        return {
          currentUser: {
            subscription: {
              ...prev.currentUser?.subscription,
              ...update,
            },
          },
        };
      });
    },
    [mutate]
  );

  if (!hasPaymentFeature) {
    return [null, () => {}] as const;
  }

  return [selector(data), set] as const;
};
