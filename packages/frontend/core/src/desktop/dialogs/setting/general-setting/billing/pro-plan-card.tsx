import { Button } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { SubscriptionService } from '@affine/core/modules/cloud';
import type { SubscriptionType } from '@affine/core/modules/cloud/entities/subscription';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import { type I18nString, i18nTime, Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';

import { CardNameLabelRow } from './card-name-label-row';
import { ManageSubscriptionButton } from './manage-subscription';
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
                subscription={proSubscription}
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
  subscription,
  gotoPlansSetting,
}: {
  subscription?: SubscriptionType | null;
  gotoPlansSetting: () => void;
}) => {
  const t = useI18n();

  if (subscription && subscription.provider !== 'stripe') return null;

  const pastDue = subscription?.status === SubscriptionStatus.PastDue;

  return (
    <div className={styles.planActionContainer}>
      <Button
        className={styles.planAction}
        variant={pastDue ? 'secondary' : 'primary'}
        onClick={gotoPlansSetting}
      >
        {subscription
          ? t['com.affine.payment.billing-setting.change-plan']()
          : t['com.affine.payment.billing-setting.upgrade']()}
      </Button>
      {pastDue ? (
        <ManageSubscriptionButton
          source={subscription}
          inCardView
          className={styles.managementInCard}
          variant="primary"
        />
      ) : null}
    </div>
  );
};
