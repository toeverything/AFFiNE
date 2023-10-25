import { SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMemo } from 'react';

type PriceI18NKeys =
  | 'com.affine.price-plan.free'
  | 'com.affine.price-plan.team'
  | 'com.affine.price-plan.pro'
  | 'com.affine.price-plan.enterprise';

type PriceTextMapping = {
  [key in SubscriptionPlan]: PriceI18NKeys;
};

const priceTextMapping: PriceTextMapping = {
  [SubscriptionPlan.Free]: 'com.affine.price-plan.free',
  [SubscriptionPlan.Team]: 'com.affine.price-plan.team',
  [SubscriptionPlan.Pro]: 'com.affine.price-plan.pro',
  [SubscriptionPlan.Enterprise]: 'com.affine.price-plan.enterprise',
};

export const usePlanI18NText = (plan: SubscriptionPlan) => {
  const t = useAFFiNEI18N();

  return useMemo(() => {
    return t[priceTextMapping[plan]]();
  }, [plan, t]);
};
