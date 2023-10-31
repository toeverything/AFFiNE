import type { SubscriptionRecurring } from '@affine/graphql';
import { checkoutMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { Loading } from '@toeverything/components/loading';
import { nanoid } from 'nanoid';
import { type FC, useEffect, useMemo } from 'react';

import * as styles from './subscription-redirect.css';
import { useSubscriptionSearch } from './use-subscription';

export const SubscriptionRedirect: FC = () => {
  const subscriptionData = useSubscriptionSearch();
  const idempotencyKey = useMemo(() => nanoid(), []);
  const { trigger: checkoutSubscription } = useMutation({
    mutation: checkoutMutation,
  });

  useEffect(() => {
    if (!subscriptionData) {
      throw new Error('No subscription data found');
    }

    // This component will be render multiple times, use timeout to avoid multiple effect.
    const timeoutId = setTimeout(() => {
      const recurring = subscriptionData.recurring as SubscriptionRecurring;
      checkoutSubscription({ recurring, idempotencyKey }).then(data => {
        window.open(data.checkout, '_self', 'norefferer');
      });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };

    // Just run this once, do not react to changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.loadingContainer}>
      <Loading size={40} />
    </div>
  );
};
