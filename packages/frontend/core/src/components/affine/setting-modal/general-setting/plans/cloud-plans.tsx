// TODO: we don't handle i18n for now
// it's better to manage all equity at server side
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import type { useAFFiNEI18N } from '@affine/i18n/hooks';
import { AfFiNeIcon } from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

import { planTitleTitleCaption } from './style.css';

type T = ReturnType<typeof useAFFiNEI18N>;

export type Benefits = Record<
  string,
  Array<{
    icon?: ReactNode;
    title: ReactNode;
  }>
>;
type BenefitsGetter = (t: T) => Benefits;
interface BasePrice {
  plan: SubscriptionPlan;
  name: string;
  description: string;
  benefits: Benefits;
}
export interface FixedPrice extends BasePrice {
  type: 'fixed';
  price: string;
  yearlyPrice: string;
  discount?: string;
  titleRenderer: (
    recurring: SubscriptionRecurring,
    detail: FixedPrice
  ) => ReactNode;
}

export interface DynamicPrice extends BasePrice {
  type: 'dynamic';
  contact: boolean;
  titleRenderer: (
    recurring: SubscriptionRecurring,
    detail: DynamicPrice
  ) => ReactNode;
}

const freeBenefits: BenefitsGetter = t => ({
  [t['com.affine.payment.cloud.free.benefit.g1']()]: ([1, 2, 3] as const).map(
    i => ({
      title: t[`com.affine.payment.cloud.free.benefit.g1-${i}`](),
    })
  ),
  [t['com.affine.payment.cloud.free.benefit.g2']()]: (
    [1, 2, 3, 4, 5] as const
  ).map(i => ({
    title: t[`com.affine.payment.cloud.free.benefit.g2-${i}`](),
  })),
});

const proBenefits: BenefitsGetter = t => ({
  [t['com.affine.payment.cloud.pro.benefit.g1']()]: [
    {
      title: t['com.affine.payment.cloud.pro.benefit.g1-1'](),
      icon: <AfFiNeIcon />,
    },
    ...([2, 3, 4, 5, 6, 7, 8] as const).map(i => ({
      title: t[`com.affine.payment.cloud.pro.benefit.g1-${i}`](),
    })),
  ],
});

const teamBenefits: BenefitsGetter = t => ({
  [t['com.affine.payment.cloud.team.benefit.g1']()]: [
    {
      title: t['com.affine.payment.cloud.team.benefit.g1-1'](),
      icon: <AfFiNeIcon />,
    },
    ...([2, 3, 4] as const).map(i => ({
      title: t[`com.affine.payment.cloud.team.benefit.g1-${i}`](),
    })),
  ],
  [t['com.affine.payment.cloud.team.benefit.g2']()]: [
    { title: t['com.affine.payment.cloud.team.benefit.g2-1']() },
    { title: t['com.affine.payment.cloud.team.benefit.g2-2']() },
    { title: t['com.affine.payment.cloud.team.benefit.g2-3']() },
  ],
});

export function getPlanDetail(t: T) {
  return new Map<SubscriptionPlan, FixedPrice | DynamicPrice>([
    [
      SubscriptionPlan.Free,
      {
        type: 'fixed',
        plan: SubscriptionPlan.Free,
        price: '0',
        yearlyPrice: '0',
        name: t['com.affine.payment.cloud.free.name'](),
        description: t['com.affine.payment.cloud.free.description'](),
        titleRenderer: () => t['com.affine.payment.cloud.free.title'](),
        benefits: freeBenefits(t),
      },
    ],
    [
      SubscriptionPlan.Pro,
      {
        type: 'fixed',
        plan: SubscriptionPlan.Pro,
        price: '1',
        yearlyPrice: '1',
        name: t['com.affine.payment.cloud.pro.name'](),
        description: t['com.affine.payment.cloud.pro.description'](),
        titleRenderer: (recurring, detail) => {
          const price =
            recurring === SubscriptionRecurring.Yearly
              ? detail.yearlyPrice
              : detail.price;
          return (
            <>
              {t['com.affine.payment.cloud.pro.title.price-monthly']({
                price: '$' + price,
              })}
              {recurring === SubscriptionRecurring.Yearly ? (
                <span className={planTitleTitleCaption}>
                  {t['com.affine.payment.cloud.pro.title.billed-yearly']()}
                </span>
              ) : null}
            </>
          );
        },
        benefits: proBenefits(t),
      },
    ],
    [
      SubscriptionPlan.Team,
      {
        type: 'dynamic',
        plan: SubscriptionPlan.Team,
        contact: true,
        name: t['com.affine.payment.cloud.team.name'](),
        description: t['com.affine.payment.cloud.team.description'](),
        titleRenderer: () => t['com.affine.payment.cloud.team.title'](),
        benefits: teamBenefits(t),
      },
    ],
  ]);
}
