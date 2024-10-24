import { Switch } from '@affine/component';
import { AuthService, SubscriptionService } from '@affine/core/modules/cloud';
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { Trans, useI18n } from '@affine/i18n';
import { AfFiNeIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { CloudPlanLayout } from './layout';
import { LifetimePlan } from './lifetime/lifetime-plan';
import { PlanCard } from './plan-card';
import { planTitleTitleCaption } from './style.css';
import * as styles from './style.css';

type T = ReturnType<typeof useI18n>;

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
    ...([2, 3, 4, 5, 7, 8] as const).map(i => ({
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

const getRecurringLabel = ({
  recurring,
  t,
}: {
  recurring: SubscriptionRecurring;
  t: ReturnType<typeof useI18n>;
}) => {
  return recurring === SubscriptionRecurring.Monthly
    ? t['com.affine.payment.recurring-monthly']()
    : t['com.affine.payment.recurring-yearly']();
};

export const CloudPlans = () => {
  const t = useI18n();
  const scrollWrapper = useRef<HTMLDivElement>(null);

  const { authService, subscriptionService } = useServices({
    AuthService,
    SubscriptionService,
  });

  const prices = useLiveData(subscriptionService.prices.prices$);
  const loggedIn = useLiveData(authService.session.status$) === 'authenticated';
  const proSubscription = useLiveData(subscriptionService.subscription.pro$);
  const isOnetimePro = useLiveData(
    subscriptionService.subscription.isOnetimePro$
  );

  const [recurring, setRecurring] = useState<SubscriptionRecurring>(
    proSubscription?.recurring ?? SubscriptionRecurring.Yearly
  );

  const planDetail = useMemo(() => {
    const rawMap = getPlanDetail(t);
    const clonedMap = new Map<SubscriptionPlan, FixedPrice | DynamicPrice>();

    rawMap.forEach((detail, plan) => {
      clonedMap.set(plan, { ...detail });
    });

    prices?.forEach(price => {
      const detail = clonedMap.get(price.plan);

      if (detail?.type === 'fixed') {
        detail.price = ((price.amount ?? 0) / 100).toFixed(2);
        detail.yearlyPrice = ((price.yearlyAmount ?? 0) / 100 / 12).toFixed(2);
        detail.discount =
          price.yearlyAmount && price.amount
            ? Math.floor(
                (1 - price.yearlyAmount / 12 / price.amount) * 100
              ).toString()
            : undefined;
      }
    });

    return clonedMap;
  }, [prices, t]);

  const currentPlan = proSubscription?.plan ?? SubscriptionPlan.Free;
  const isCanceled = !!proSubscription?.canceledAt;
  const currentRecurring =
    proSubscription?.recurring ?? SubscriptionRecurring.Monthly;
  const yearlyDiscount = (
    planDetail.get(SubscriptionPlan.Pro) as FixedPrice | undefined
  )?.discount;

  // auto scroll to current plan card
  useEffect(() => {
    if (!scrollWrapper.current) return;
    const currentPlanCard = scrollWrapper.current?.querySelector(
      '[data-current="true"]'
    );
    const wrapperComputedStyle = getComputedStyle(scrollWrapper.current);
    const left = currentPlanCard
      ? currentPlanCard.getBoundingClientRect().left -
        scrollWrapper.current.getBoundingClientRect().left -
        parseInt(wrapperComputedStyle.paddingLeft)
      : 0;
    const appeared = scrollWrapper.current.dataset.appeared === 'true';
    const animationFrameId = requestAnimationFrame(() => {
      scrollWrapper.current?.scrollTo({
        behavior: appeared ? 'smooth' : 'instant',
        left,
      });
      scrollWrapper.current?.setAttribute('data-appeared', 'true');
    });
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [recurring]);

  // caption
  const cloudCaption = loggedIn ? (
    isCanceled ? (
      <p>
        {t['com.affine.payment.subtitle-canceled']({
          plan: `${getRecurringLabel({
            recurring: currentRecurring,
            t,
          })} ${currentPlan}`,
        })}
      </p>
    ) : (
      <p>
        <Trans
          plan={currentPlan}
          i18nKey="com.affine.payment.subtitle-active"
          values={{ currentPlan }}
        >
          You are currently on the {{ currentPlan }} plan. If you have any
          questions, please contact our&nbsp;
          <a
            href="mailto:support@toeverything.info"
            style={{ color: 'var(--affine-link-color)' }}
          >
            customer support
          </a>
          .
        </Trans>
      </p>
    )
  ) : (
    <p>{t['com.affine.payment.subtitle-not-signed-in']()}</p>
  );

  // toggle
  const cloudToggle = (
    <div className={styles.recurringToggleWrapper}>
      <div>
        {recurring === SubscriptionRecurring.Yearly ? (
          <div className={styles.recurringToggleRecurring}>
            {t['com.affine.payment.cloud.pricing-plan.toggle-yearly']()}
          </div>
        ) : (
          <>
            <div className={styles.recurringToggleRecurring}>
              <span>
                {t[
                  'com.affine.payment.cloud.pricing-plan.toggle-billed-yearly'
                ]()}
              </span>
            </div>
            {yearlyDiscount ? (
              <div className={styles.recurringToggleDiscount}>
                {t['com.affine.payment.cloud.pricing-plan.toggle-discount']({
                  discount: yearlyDiscount,
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
      <Switch
        checked={recurring === SubscriptionRecurring.Yearly}
        onChange={checked =>
          setRecurring(
            checked
              ? SubscriptionRecurring.Yearly
              : SubscriptionRecurring.Monthly
          )
        }
      />
    </div>
  );

  const cloudScroll = (
    <div className={styles.planCardsWrapper} ref={scrollWrapper}>
      {Array.from(planDetail.values()).map(detail => {
        return <PlanCard key={detail.plan} {...{ detail, recurring }} />;
      })}
    </div>
  );

  const cloudSelect = (
    <div className={styles.cloudSelect}>
      <b>{t['com.affine.payment.cloud.pricing-plan.select.title']()}</b>
      <span>{t['com.affine.payment.cloud.pricing-plan.select.caption']()}</span>
    </div>
  );

  return (
    <CloudPlanLayout
      caption={cloudCaption}
      select={cloudSelect}
      toggle={cloudToggle}
      scroll={cloudScroll}
      scrollRef={scrollWrapper}
      lifetime={isOnetimePro ? null : <LifetimePlan />}
    />
  );
};
