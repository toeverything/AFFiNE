import { type SubscriptionQuery, subscriptionQuery } from '@affine/graphql';
import { useQuery } from '@affine/workspace/affine/gql';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';

import { useSelfHosted } from './affine/use-server-flavor';

export type Subscription = NonNullable<
  NonNullable<SubscriptionQuery['currentUser']>['subscription']
>;

export type SubscriptionMutator = (update?: Partial<Subscription>) => void;

const selector = (data: SubscriptionQuery) =>
  data.currentUser?.subscription ?? null;

export const useUserSubscription = () => {
  const isSelfHosted = useSelfHosted();
  const { data, mutate } = useQuery({
    query: subscriptionQuery,
  });

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

  if (isSelfHosted) {
    return [selector(data), () => {}] as const;
  }

  return [selector(data), set] as const;
};
