import type { SubscriptionMutator } from '@affine/core/hooks/use-subscription';
import type {
  PricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
} from '@affine/graphql';

export interface BaseActionProps {
  price: PricesQuery['prices'][number];
  recurring: SubscriptionRecurring;
  plan: SubscriptionPlan;
  onSubscriptionUpdate: SubscriptionMutator;
}
