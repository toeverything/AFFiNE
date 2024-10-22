import { Button } from '@affine/component';
import { AuthService, SubscriptionService } from '@affine/core/modules/cloud';
import { i18nTime, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

import { AICancel, AILogin, AIResume, AISubscribe } from './actions';
import { AIRedeemCodeButton } from './actions/redeem';
import * as styles from './ai-plan.css';
import { AIPlanLayout } from './layout';

export const AIPlan = () => {
  const t = useI18n();

  const authService = useService(AuthService);
  const subscriptionService = useService(SubscriptionService);
  const subscription = useLiveData(subscriptionService.subscription.ai$);
  const price = useLiveData(subscriptionService.prices.aiPrice$);
  const isLoggedIn =
    useLiveData(authService.session.status$) === 'authenticated';
  const isOnetime = useLiveData(subscriptionService.subscription.isOnetimeAI$);

  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  // yearly subscription should always be available
  if (!price?.yearlyAmount) {
    return null;
  }

  const billingTip = subscription?.nextBillAt
    ? t['com.affine.payment.ai.billing-tip.next-bill-at']({
        due: i18nTime(subscription.nextBillAt, {
          absolute: { accuracy: 'day' },
        }),
      })
    : subscription?.canceledAt && subscription.end
      ? t['com.affine.payment.ai.billing-tip.end-at']({
          end: i18nTime(subscription.end, {
            absolute: { accuracy: 'day' },
          }),
        })
      : null;

  return (
    <AIPlanLayout
      caption={
        subscription
          ? t['com.affine.payment.ai.pricing-plan.caption-purchased']()
          : t['com.affine.payment.ai.pricing-plan.caption-free']()
      }
      actionButtons={
        isLoggedIn ? (
          subscription ? (
            isOnetime ? (
              <AIRedeemCodeButton className={styles.purchaseButton} />
            ) : subscription.canceledAt ? (
              <AIResume className={styles.purchaseButton} />
            ) : (
              <AICancel className={styles.purchaseButton} />
            )
          ) : (
            <>
              <AISubscribe
                className={styles.purchaseButton}
                displayedFrequency="monthly"
              />
              <a href="https://ai.affine.pro" target="_blank" rel="noreferrer">
                <Button className={styles.learnAIButton}>
                  {t['com.affine.payment.ai.pricing-plan.learn']()}
                </Button>
              </a>
            </>
          )
        ) : (
          <AILogin className={styles.purchaseButton} />
        )
      }
      billingTip={billingTip}
    />
  );
};
