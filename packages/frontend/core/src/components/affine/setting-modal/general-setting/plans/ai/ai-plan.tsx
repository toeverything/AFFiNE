import { Button } from '@affine/component';
import { AuthService, SubscriptionService } from '@affine/core/modules/cloud';
import { i18nTime } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

import { AIPlanLayout } from '../layout';
import { AICancel, AILogin, AIResume, AISubscribe } from './actions';
import * as styles from './ai-plan.css';
import { AIBenefits } from './benefits';

export const AIPlan = () => {
  const t = useAFFiNEI18N();

  const authService = useService(AuthService);
  const subscriptionService = useService(SubscriptionService);
  const subscription = useLiveData(subscriptionService.subscription.ai$);
  const price = useLiveData(subscriptionService.prices.aiPrice$);
  const isLoggedIn =
    useLiveData(authService.session.status$) === 'authenticated';

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
      title={t['com.affine.payment.ai.pricing-plan.title']()}
      caption={
        subscription
          ? t['com.affine.payment.ai.pricing-plan.caption-purchased']()
          : t['com.affine.payment.ai.pricing-plan.caption-free']()
      }
    >
      <div className={styles.card}>
        <div className={styles.titleBlock}>
          <section className={styles.titleCaption1}>
            {t['com.affine.payment.ai.pricing-plan.title-caption-1']()}
          </section>
          <section className={styles.title}>
            {t['com.affine.payment.ai.pricing-plan.title']()}
          </section>
          <section className={styles.titleCaption2}>
            {t['com.affine.payment.ai.pricing-plan.title-caption-2']()}
          </section>
        </div>

        <div className={styles.actionBlock}>
          <div className={styles.actionButtons}>
            {isLoggedIn ? (
              subscription ? (
                subscription.canceledAt ? (
                  <AIResume className={styles.purchaseButton} />
                ) : (
                  <AICancel className={styles.purchaseButton} />
                )
              ) : (
                <>
                  <AISubscribe className={styles.learnAIButton} />
                  <a
                    href="https://ai.affine.pro"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button className={styles.learnAIButton}>
                      {t['com.affine.payment.ai.pricing-plan.learn']()}
                    </Button>
                  </a>
                </>
              )
            ) : (
              <AILogin className={styles.purchaseButton} />
            )}
          </div>
          {billingTip ? (
            <div className={styles.agreement}>{billingTip}</div>
          ) : null}
        </div>

        <AIBenefits />
      </div>
    </AIPlanLayout>
  );
};
