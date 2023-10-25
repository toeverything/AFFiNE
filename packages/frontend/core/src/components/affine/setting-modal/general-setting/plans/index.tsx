import { RadioButton, RadioButtonGroup } from '@affine/component';
import {
  pricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
} from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useQuery } from '@affine/workspace/affine/gql';
import { Suspense, useEffect, useRef, useState } from 'react';

import { useCurrentLoginStatus } from '../../../../../hooks/affine/use-current-login-status';
import { useUserSubscription } from '../../../../../hooks/use-subscription';
import { PlanLayout } from './layout';
import { type FixedPrice, getPlanDetail, PlanCard } from './plan-card';
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
    ? t['com.affine.settings.plans.recurring-monthly']()
    : t['com.affine.settings.plans.recurring-yearly']();
};

const Settings = () => {
  const t = useAFFiNEI18N();
  const [subscription, mutateSubscription] = useUserSubscription();
  const loggedIn = useCurrentLoginStatus() === 'authenticated';
  const planDetail = getPlanDetail(t);
  const scrollWrapper = useRef<HTMLDivElement>(null);

  const {
    data: { prices },
  } = useQuery({
    query: pricesQuery,
  });

  prices.forEach(price => {
    const detail = planDetail.get(price.plan);

    if (detail?.type === 'fixed') {
      detail.price = (price.amount / 100).toFixed(2);
      detail.yearlyPrice = (price.yearlyAmount / 100 / 12).toFixed(2);
      detail.discount = (
        (1 - price.yearlyAmount / 12 / price.amount) *
        100
      ).toFixed(2);
    }
  });

  const [recurring, setRecurring] = useState<string>(
    subscription?.recurring ?? SubscriptionRecurring.Yearly
  );

  const currentPlan = subscription?.plan ?? SubscriptionPlan.Free;
  const isCanceled = !!subscription?.canceledAt;
  const currentRecurring =
    subscription?.recurring ?? SubscriptionRecurring.Monthly;

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
    const appeared =
      scrollWrapper.current.getAttribute('data-appeared') === 'true';
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

  const subtitle = loggedIn ? (
    isCanceled ? (
      <p>
        {t['com.affine.settings.plans.subtitle-canceled']({
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
          i18nKey="com.affine.settings.plans.subtitle-active"
          values={{ currentPlan }}
        >
          You are current on the {{ currentPlan }} plan. If you have any
          questions, please contact our&nbsp;
          <a
            href="#"
            target="_blank"
            style={{ color: 'var(--affine-link-color)' }}
          >
            customer support
          </a>
          .
        </Trans>
      </p>
    )
  ) : (
    <p>{t['com.affine.settings.plans.subtitle-not-signed-in']()}</p>
  );

  const tabs = (
    <RadioButtonGroup
      className={styles.recurringRadioGroup}
      value={recurring}
      onValueChange={setRecurring}
    >
      {Object.values(SubscriptionRecurring).map(recurring => (
        <RadioButton key={recurring} value={recurring}>
          {getRecurringLabel({ recurring, t })}
          {recurring === SubscriptionRecurring.Yearly && yearlyDiscount && (
            <span className={styles.radioButtonDiscount}>
              {t['com.affine.settings.plans.discount-amount']({
                amount: yearlyDiscount,
              })}
            </span>
          )}
        </RadioButton>
      ))}
    </RadioButtonGroup>
  );

  const scroll = (
    <div className={styles.planCardsWrapper} ref={scrollWrapper}>
      {Array.from(planDetail.values()).map(detail => {
        return (
          <PlanCard
            key={detail.plan}
            onSubscriptionUpdate={mutateSubscription}
            {...{ detail, subscription, recurring }}
          />
        );
      })}
    </div>
  );

  return (
    <PlanLayout scrollRef={scrollWrapper} {...{ subtitle, tabs, scroll }} />
  );
};

export const AFFiNECloudPlans = () => {
  return (
    // TODO: Error Boundary
    <Suspense fallback={<PlansSkeleton />}>
      <Settings />
    </Suspense>
  );
};