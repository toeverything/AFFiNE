import { Skeleton } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { SubscriptionStatus } from '@affine/graphql';
import { i18nTime, Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import { AICancel, AIResume, AISubscribe } from '../plans/ai/actions';
import { AIRedeemCodeButton } from '../plans/ai/actions/redeem';
import { CardNameLabelRow } from './card-name-label-row';
import { PaymentMethodUpdater } from './payment-method';
import * as styles from './style.css';

export const AIPlanCard = ({ onClick }: { onClick: () => void }) => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);
  const price = useLiveData(subscriptionService.prices.aiPrice$);
  const subscription = useLiveData(subscriptionService.subscription.ai$);
  const isOnetime = useLiveData(subscriptionService.subscription.isOnetimeAI$);

  const priceReadable = price?.yearlyAmount
    ? `$${(price.yearlyAmount / 100).toFixed(2)}`
    : '?';
  const priceFrequency = t['com.affine.payment.billing-setting.year']();

  const billingTip = useMemo(() => {
    if (subscription === undefined) {
      return (
        <Trans
          i18nKey={'com.affine.payment.billing-setting.ai.free-desc'}
          components={{
            a: <span onClick={onClick} className={styles.currentPlanName} />,
          }}
        />
      );
    }
    if (subscription?.status === SubscriptionStatus.PastDue) {
      return t['com.affine.payment.billing-tip.past-due']({
        due: i18nTime(subscription.nextBillAt, {
          absolute: { accuracy: 'day' },
        }),
      });
    }
    if (subscription?.nextBillAt) {
      return t['com.affine.payment.ai.billing-tip.next-bill-at']({
        due: i18nTime(subscription.nextBillAt, {
          absolute: { accuracy: 'day' },
        }),
      });
    }
    if ((isOnetime || subscription?.canceledAt) && subscription?.end) {
      return t['com.affine.payment.ai.billing-tip.end-at']({
        end: i18nTime(subscription.end, { absolute: { accuracy: 'day' } }),
      });
    }
    return null;
  }, [subscription, isOnetime, onClick, t]);

  if (subscription === null) {
    return <Skeleton height={100} />;
  }

  return (
    <div className={styles.planCard} style={{ marginBottom: 24 }}>
      <div className={styles.currentPlan}>
        <SettingRow
          spreadCol={false}
          name={
            <CardNameLabelRow
              cardName={t['com.affine.payment.billing-setting.ai-plan']()}
              status={subscription?.status}
            />
          }
          desc={
            <>
              {billingTip}
              <div className={styles.planActionContainer}>
                {price?.yearlyAmount ? (
                  subscription ? (
                    isOnetime ? (
                      <AIRedeemCodeButton className={styles.planAction} />
                    ) : subscription.canceledAt ? (
                      <AIResume className={styles.planAction} />
                    ) : (
                      <AICancel className={styles.planAction} />
                    )
                  ) : (
                    <AISubscribe className={styles.planAction}>
                      {t[
                        'com.affine.payment.billing-setting.ai.start-free-trial'
                      ]()}
                    </AISubscribe>
                  )
                ) : null}
                {subscription?.status === SubscriptionStatus.PastDue ? (
                  <PaymentMethodUpdater
                    inCardView
                    className={styles.managementInCard}
                    variant="primary"
                  />
                ) : null}
              </div>
            </>
          }
        />
      </div>
      <p className={styles.planPrice}>
        {subscription ? priceReadable : '$0'}
        <span className={styles.billingFrequency}>/{priceFrequency}</span>
      </p>
    </div>
  );
};
