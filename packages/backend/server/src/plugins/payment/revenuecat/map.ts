import { SubscriptionPlan, SubscriptionRecurring } from '../types';
import { Subscription } from './service';

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

function resolveFallbackFromEntitlement(
  entitlement: string | null | undefined,
  duration: string | null | undefined
): ProductMapping | null {
  const ent = (entitlement || '').toLowerCase();
  const dur = (duration || '').toUpperCase();
  const isPro = ent === 'pro';
  const isAI = ent === 'ai';
  const isM = dur === 'P1M';
  const isY = dur === 'P1Y';
  if ((isPro || isAI) && (isM || isY)) {
    return {
      plan: isPro ? SubscriptionPlan.Pro : SubscriptionPlan.AI,
      recurring: isM
        ? SubscriptionRecurring.Monthly
        : SubscriptionRecurring.Yearly,
    };
  }
  return null;
}

export function resolveProductMapping(
  sub: Partial<Subscription>,
  override?: Record<string, { plan: string; recurring: string }>
): ProductMapping | null {
  const { productId, identifier, duration } = sub;
  if (override && productId && productId in override) {
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
  return (
    (productId && DEFAULT_PRODUCT_MAP[productId]) ||
    resolveFallbackFromEntitlement(identifier, duration) ||
    null
  );
}
