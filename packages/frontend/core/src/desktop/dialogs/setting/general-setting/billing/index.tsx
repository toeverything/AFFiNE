import { Skeleton } from '@affine/component';
import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import type { SettingState } from '../../types';
import { AIPlanCard } from './ai-plan-card';
import { BelieverIdentifier } from './biliever-identifier';
import { BillingHistory } from './billing-history';
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

  return (
    <>
      <SettingHeader
        title={t['com.affine.payment.billing-setting.title']()}
        subtitle={t['com.affine.payment.billing-setting.subtitle']()}
      />
      <SettingWrapper
        title={t['com.affine.payment.billing-setting.information']()}
      >
        <SubscriptionSettings onChangeSettingState={onChangeSettingState} />
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.payment.billing-setting.history']()}>
        <BillingHistory />
      </SettingWrapper>
    </>
  );
};

const SubscriptionSettings = ({
  onChangeSettingState,
}: {
  onChangeSettingState: (state: SettingState) => void;
}) => {
  const subscriptionService = useService(SubscriptionService);
  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  const proSubscription = useLiveData(subscriptionService.subscription.pro$);
  const isBeliever = useLiveData(subscriptionService.subscription.isBeliever$);

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

      {proSubscription !== null ? (
        isBeliever ? (
          <BelieverIdentifier onOpenPlans={gotoCloudPlansSetting} />
        ) : (
          <ProPlanCard gotoCloudPlansSetting={gotoCloudPlansSetting} />
        )
      ) : (
        <SubscriptionSettingSkeleton />
      )}

      <TypeformLink />

      {proSubscription !== null ? (
        proSubscription && <PaymentMethod />
      ) : (
        <SubscriptionSettingSkeleton />
      )}
    </div>
  );
};

const SubscriptionSettingSkeleton = () => {
  const t = useI18n();
  return (
    <SettingWrapper
      title={t['com.affine.payment.billing-setting.information']()}
    >
      <div className={styles.subscriptionSettingSkeleton}>
        <Skeleton variant="rounded" height="104px" />
        <Skeleton variant="rounded" height="46px" />
      </div>
    </SettingWrapper>
  );
};
