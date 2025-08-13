import { Button } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { SubscriptionService } from '@affine/core/modules/cloud';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import { type I18nString, i18nTime, Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

import { RedeemCode } from '../plans/plan-card';
import { CardNameLabelRow } from './card-name-label-row';
import { PaymentMethodUpdater } from './payment-method';
import * as styles from './style.css';

const DescriptionI18NKey = {
  Basic: 'com.affine.payment.billing-setting.current-plan.description',
  Monthly:
    'com.affine.payment.billing-setting.current-plan.description.monthly',
  Yearly: 'com.affine.payment.billing-setting.current-plan.description.yearly',
  Lifetime:
    'com.affine.payment.billing-setting.current-plan.description.lifetime',
} as const satisfies { [key: string]: I18nString };

const getMessageKey = (
  plan: SubscriptionPlan,
  recurring: SubscriptionRecurring
) => {
  if (plan !== SubscriptionPlan.Pro) {
    return DescriptionI18NKey.Basic;
  }
  return DescriptionI18NKey[recurring];
};

export const ProPlanCard = ({
  gotoCloudPlansSetting,
}: {
  gotoCloudPlansSetting: () => void;
}) => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);
  const proSubscription = useLiveData(subscriptionService.subscription.pro$);

  const proPrice = useLiveData(subscriptionService.prices.proPrice$);

  const currentPlan = proSubscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring =
    proSubscription?.recurring ?? SubscriptionRecurring.Monthly;

  const amount = proSubscription
    ? proPrice
      ? proSubscription.recurring === SubscriptionRecurring.Monthly
        ? String((proPrice.amount ?? 0) / 100)
        : String((proPrice.yearlyAmount ?? 0) / 100)
      : '?'
    : '0';

  return (
    <div className={styles.planCard}>
      <div className={styles.currentPlan}>
        <SettingRow
          spreadCol={false}
          name={
            <CardNameLabelRow
              cardName={t['com.affine.payment.billing-setting.current-plan']()}
              status={proSubscription?.status}
            />
          }
          desc={
            <>
              <Trans
                i18nKey={getMessageKey(currentPlan, currentRecurring)}
                values={{
                  planName: currentPlan,
                }}
                components={{
                  1: (
                    <span
                      onClick={gotoCloudPlansSetting}
                      className={styles.currentPlanName}
                    />
                  ),
                }}
              />
              <CloudExpirationInfo />
              <PlanAction
                plan={currentPlan}
                subscriptionStatus={proSubscription?.status}
                gotoPlansSetting={gotoCloudPlansSetting}
              />
            </>
          }
        />
      </div>
      <p className={styles.planPrice}>
        ${amount}
        <span className={styles.billingFrequency}>
          /
          {currentRecurring === SubscriptionRecurring.Monthly
            ? t['com.affine.payment.billing-setting.month']()
            : t['com.affine.payment.billing-setting.year']()}
        </span>
      </p>
    </div>
  );
};

const CloudExpirationInfo = () => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  const subscription = useLiveData(subscriptionService.subscription.pro$);

  let text = '';

  if (subscription?.status === SubscriptionStatus.PastDue) {
    text = t['com.affine.payment.billing-tip.past-due']({
      due: i18nTime(subscription.nextBillAt, {
        absolute: { accuracy: 'day' },
      }),
    });
  } else if (subscription?.nextBillAt) {
    text = t['com.affine.payment.billing-setting.renew-date.description']({
      renewDate: i18nTime(subscription.nextBillAt, {
        absolute: { accuracy: 'day' },
      }),
    });
  } else if (subscription?.end) {
    text = t['com.affine.payment.billing-setting.due-date.description']({
      dueDate: i18nTime(subscription.end, {
        absolute: { accuracy: 'day' },
      }),
    });
  }

  return text ? (
    <>
      <br />
      {text}
    </>
  ) : null;
};

const PlanAction = ({
  plan,
  subscriptionStatus,
  gotoPlansSetting,
}: {
  plan: string;
  gotoPlansSetting: () => void;
  subscriptionStatus?: SubscriptionStatus;
}) => {
  const t = useI18n();

  const subscription = useService(SubscriptionService).subscription;
  const isOnetimePro = useLiveData(subscription.isOnetimePro$);

  if (isOnetimePro) {
    return <RedeemCode variant="primary" className={styles.planAction} />;
  }

  return (
    <div className={styles.planActionContainer}>
      <Button
        className={styles.planAction}
        variant={
          subscriptionStatus === SubscriptionStatus.PastDue
            ? 'secondary'
            : 'primary'
        }
        onClick={gotoPlansSetting}
      >
        {plan === SubscriptionPlan.Pro
          ? t['com.affine.payment.billing-setting.change-plan']()
          : t['com.affine.payment.billing-setting.upgrade']()}
      </Button>
      {subscriptionStatus === SubscriptionStatus.PastDue ? (
        <PaymentMethodUpdater
          inCardView
          className={styles.managementInCard}
          variant="primary"
        />
      ) : null}
    </div>
  );
};
