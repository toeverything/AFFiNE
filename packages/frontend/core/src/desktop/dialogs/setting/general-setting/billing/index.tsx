import { Button, Skeleton } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import type { SettingState } from '../../types';
import { AIPlanCard } from './ai-plan-card';
import { BelieverIdentifier } from './biliever-identifier';
import { BillingHistory } from './billing-history';
import { SubscriptionSourceRow } from './manage-subscription';
import { PaymentMethod } from './payment-method';
import { ProPlanCard } from './pro-plan-card';
import * as styles from './style.css';
import { TypeformLink } from './typeform-link';

export const BillingSettings = ({
  onChangeSettingState,
}: {
  onChangeSettingState: (state: SettingState) => void;
}) => {
  const t = useI18n();
  const { subscription, prices } = useService(SubscriptionService);
  const billing = useLiveData(subscription.billing$);
  const error = useLiveData(subscription.error$);
  const isRevalidating = useLiveData(subscription.isRevalidating$);

  useEffect(() => {
    subscription.revalidate();
    prices.revalidate();
  }, [subscription, prices]);

  return (
    <>
      <SettingHeader
        title={t['com.affine.payment.billing-setting.title']()}
        subtitle={t['com.affine.payment.billing-setting.subtitle']()}
      />
      <SettingWrapper
        title={t['com.affine.payment.billing-setting.information']()}
      >
        {error != null && (
          <SettingRow
            name={t[
              billing
                ? 'com.affine.payment.billing-setting.refresh-failed'
                : 'com.affine.payment.billing-setting.load-failed'
            ]()}
          >
            <Button disabled={isRevalidating} onClick={subscription.revalidate}>
              {t['com.affine.payment.billing-setting.retry']()}
            </Button>
          </SettingRow>
        )}
        {billing ? (
          <>
            <SubscriptionBilling />
            <SubscriptionSettings onChangeSettingState={onChangeSettingState} />
          </>
        ) : billing === null && error == null ? (
          <SubscriptionSettingSkeleton />
        ) : null}
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.payment.billing-setting.history']()}>
        <BillingHistory />
      </SettingWrapper>
    </>
  );
};

const SubscriptionBilling = () => {
  const t = useI18n();
  const { subscription } = useService(SubscriptionService);
  const conflicts = useLiveData(subscription.conflicts$);
  const manageable = useLiveData(subscription.manageable$);
  const groups = [
    ...(conflicts ?? []).map(group => ({ ...group, conflict: true })),
    ...(manageable ?? []).map(group => ({ ...group, conflict: false })),
  ];
  return groups.map(({ plan, sources, conflict }) => (
    <SettingWrapper
      key={plan}
      title={t[
        conflict
          ? 'com.affine.payment.billing-setting.subscription-conflict'
          : 'com.affine.payment.billing-setting.subscription-manageable'
      ]({
        planName: plan === SubscriptionPlan.AI ? 'AFFiNE AI' : 'AFFiNE Pro',
      })}
    >
      <SettingRow
        name={t[
          conflict
            ? 'com.affine.payment.billing-setting.subscription-conflict.description'
            : 'com.affine.payment.billing-setting.subscription-manageable.description'
        ]()}
      />
      {sources.map(source => (
        <SubscriptionSourceRow key={source.id} source={source} />
      ))}
    </SettingWrapper>
  ));
};

const SubscriptionSettings = ({
  onChangeSettingState,
}: {
  onChangeSettingState: (state: SettingState) => void;
}) => {
  const { subscription } = useService(SubscriptionService);
  const proSubscription = useLiveData(subscription.pro$);
  const isBeliever = useLiveData(subscription.isBeliever$);

  const openPlans = useCallback(
    (scrollAnchor?: string) => {
      track.$.settingsPanel.billing.viewPlans();
      onChangeSettingState({
        activeTab: 'plans',
        scrollAnchor: scrollAnchor,
      });
    },
    [onChangeSettingState]
  );
  const gotoCloudPlansSetting = useCallback(
    () => openPlans('cloudPricingPlan'),
    [openPlans]
  );
  const gotoAiPlanSetting = useCallback(
    () => openPlans('aiPricingPlan'),
    [openPlans]
  );

  return (
    <div className={styles.subscription}>
      <AIPlanCard onClick={gotoAiPlanSetting} />

      {isBeliever ? (
        <BelieverIdentifier onOpenPlans={gotoCloudPlansSetting} />
      ) : (
        <ProPlanCard gotoCloudPlansSetting={gotoCloudPlansSetting} />
      )}

      <TypeformLink />

      {proSubscription && (
        <PaymentMethod
          key={proSubscription.id}
          subscription={proSubscription}
        />
      )}
    </div>
  );
};

const SubscriptionSettingSkeleton = () => {
  return (
    <div className={styles.subscriptionSettingSkeleton}>
      <Skeleton variant="rounded" height="104px" />
      <Skeleton variant="rounded" height="46px" />
    </div>
  );
};
