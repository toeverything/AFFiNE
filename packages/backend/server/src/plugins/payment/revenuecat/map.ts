import { SubscriptionPlan, SubscriptionRecurring } from '../types';

export interface ProductMapping {
  plan: SubscriptionPlan;
  recurring: SubscriptionRecurring;
}

// default whitelist mapping per PRD
export const DEFAULT_PRODUCT_MAP: Record<string, ProductMapping> = {
  'app.affine.pro.Monthly': {
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Monthly,
  },
  'app.affine.pro.Annual': {
    plan: SubscriptionPlan.Pro,
    recurring: SubscriptionRecurring.Yearly,
  },
  'app.affine.pro.ai.Annual': {
    plan: SubscriptionPlan.AI,
    recurring: SubscriptionRecurring.Yearly,
  },
};

export function resolveProductMapping(
  productId: string,
  override?: Record<string, { plan: string; recurring: string }>
): ProductMapping | null {
  if (override && productId in override) {
    const m = override[productId];
    const plan = m.plan as SubscriptionPlan;
    const recurring = m.recurring as SubscriptionRecurring;
    if (
      [SubscriptionPlan.Pro, SubscriptionPlan.AI].includes(plan) &&
      [SubscriptionRecurring.Monthly, SubscriptionRecurring.Yearly].includes(
        recurring
      )
    ) {
      return { plan, recurring };
    }
  }
  return DEFAULT_PRODUCT_MAP[productId] || null;
}
