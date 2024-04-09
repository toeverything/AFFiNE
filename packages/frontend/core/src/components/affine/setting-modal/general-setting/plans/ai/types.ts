import type { SubscriptionMutator } from '@affine/core/hooks/use-subscription';
import type { PricesQuery, SubscriptionRecurring } from '@affine/graphql';

export interface BaseActionProps {
  price: PricesQuery['prices'][number];
  recurring: SubscriptionRecurring;
  onSubscriptionUpdate: SubscriptionMutator;
}
