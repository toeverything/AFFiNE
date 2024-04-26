import { Switch } from '@affine/component';
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';

import { SWRErrorBoundary } from '../../../../../components/pure/swr-error-bundary';
import { AuthService, SubscriptionService } from '../../../../../modules/cloud';
import { AIPlan } from './ai/ai-plan';
import { type FixedPrice, getPlanDetail } from './cloud-plans';
import { CloudPlanLayout, PlanLayout } from './layout';
import { PlanCard } from './plan-card';
import { PlansSkeleton } from './skeleton';
import * as styles from './style.css';

const getRecurringLabel = ({
  recurring,
  t,
}: {
  recurring: SubscriptionRecurring;
  t: ReturnType<typeof useAFFiNEI18N>;
}) => {
  return recurring === SubscriptionRecurring.Monthly
    ? t['com.affine.payment.recurring-monthly']()
    : t['com.affine.payment.recurring-yearly']();
};

const Settings = () => {
  const t = useAFFiNEI18N();

  const loggedIn =
    useLiveData(useService(AuthService).session.status$) === 'authenticated';
  const planDetail = useMemo(() => getPlanDetail(t), [t]);
  const scrollWrapper = useRef<HTMLDivElement>(null);

  const subscriptionService = useService(SubscriptionService);
  const proSubscription = useLiveData(subscriptionService.subscription.pro$);
  const prices = useLiveData(subscriptionService.prices.prices$);

  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  prices?.forEach(price => {
    const detail = planDetail.get(price.plan);

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

  const [recurring, setRecurring] = useState<SubscriptionRecurring>(
    proSubscription?.recurring ?? SubscriptionRecurring.Yearly
  );

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

  if (prices === null) {
    return <PlansSkeleton />;
  }

  return (
    <PlanLayout
      aiTip
      cloud={
        <CloudPlanLayout
          caption={cloudCaption}
          select={cloudSelect}
          toggle={cloudToggle}
          scroll={cloudScroll}
          scrollRef={scrollWrapper}
        />
      }
      ai={<AIPlan />}
    />
  );
};

export const AFFiNEPricingPlans = () => {
  return (
    <SWRErrorBoundary FallbackComponent={PlansErrorBoundary}>
      <Settings />
    </SWRErrorBoundary>
  );
};

const PlansErrorBoundary = ({ resetErrorBoundary }: FallbackProps) => {
  const t = useAFFiNEI18N();

  const scroll = (
    <div className={styles.errorTip}>
      <span>{t['com.affine.payment.plans-error-tip']()}</span>
      <a onClick={resetErrorBoundary} className={styles.errorTipRetry}>
        {t['com.affine.payment.plans-error-retry']()}
      </a>
    </div>
  );

  return <PlanLayout cloud={<CloudPlanLayout scroll={scroll} />} />;
};
